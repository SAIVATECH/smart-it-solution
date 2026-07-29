import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { processCustomerMessage } from "@/lib/ai/aiSalesAgent";

/**
 * GET Webhook Verification Handler (Meta API - Instagram)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe" && token === (process.env.WEBHOOK_VERIFY_TOKEN || "Saivatech")) {
      logger.info("Instagram Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }
  }

  logger.warn("Instagram Webhook verification failed");
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST Incoming Instagram DM Event Handler
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    if (payload.object !== "instagram") {
      return NextResponse.json({ status: "ignored_not_instagram" });
    }

    const entry = payload.entry?.[0];
    const messaging = entry?.messaging?.[0];

    if (!messaging || !messaging.message) {
      return NextResponse.json({ status: "ignored_non_message" });
    }

    // Ignore echoes
    if (messaging.message.is_echo) {
      return NextResponse.json({ status: "ignored_echo" });
    }

    const fromInstagramId = messaging.sender?.id;
    const bodyText = messaging.message.text || "";

    if (!fromInstagramId || !bodyText) {
      return NextResponse.json({ status: "ignored_empty" });
    }

    // Locate fallback tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant context not found" }, { status: 400 });
    }
    const tenantId = tenant.id;

    // Map Instagram ID to customer
    const customer = await prisma.customer.upsert({
      where: {
        tenantId_waId: {
          tenantId,
          waId: `ig_${fromInstagramId}`,
        },
      },
      update: {},
      create: {
        tenantId,
        waId: `ig_${fromInstagramId}`,
        name: `Instagram User ${fromInstagramId.substring(0, 4)}`,
      },
    });

    // Locate or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId,
        customerId: customer.id,
        status: { in: ["AI_ACTIVE", "HUMAN_TAKEOVER"] },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          customerId: customer.id,
          status: "AI_ACTIVE",
        },
      });
    }

    // Save Customer Message
    try {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          waMessageId: messaging.message.mid || `ig_${Date.now()}`,
          sender: "CUSTOMER",
          messageType: "TEXT",
          content: bodyText,
        },
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        return NextResponse.json({ status: "ignored_duplicate" });
      }
      throw err;
    }

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    if (conversation.status === "AI_ACTIVE") {
      logger.info(`AI active for Instagram conversation ${conversation.id}. Generating reply.`);
      
      const aiReply = await processCustomerMessage(tenantId, customer.id, bodyText);

      // Post reply to Instagram Graph API
      const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || "";
      const sendUrl = `https://graph.facebook.com/v21.0/me/messages`;

      let sent = false;
      if (accessToken) {
        try {
          const res = await fetch(sendUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              recipient: { id: fromInstagramId },
              message: { text: aiReply },
            }),
          });
          sent = res.ok;
          if (!sent) {
            const errTxt = await res.text();
            logger.error(`Instagram API send failed: ${errTxt}`);
          }
        } catch (fetchErr: any) {
          logger.error(`Failed to post to Instagram API: ${fetchErr.message}`);
        }
      }

      // Save AI Message
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "AI",
          messageType: "TEXT",
          content: aiReply,
          status: sent ? "SENT" : "FAILED",
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });
    }

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    logger.error(`Error processing Instagram webhook: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
