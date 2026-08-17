import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/whatsappService";
import { processCustomerMessage } from "@/lib/ai/aiSalesAgent";

/**
 * GET Webhook Verification Handler (Meta API)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode && token) {
    if (mode === "subscribe") {
      // Find the WhatsApp account configured with this verify token
      const account = await prisma.whatsAppAccount.findFirst({
        where: { verifyToken: token },
      });

      if (account || token === process.env.WEBHOOK_VERIFY_TOKEN) {
        logger.info("WhatsApp Webhook verified successfully");
        return new Response(challenge, { status: 200 });
      }
    }
  }

  logger.warn("WhatsApp Webhook verification failed due to token mismatch");
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST Incoming Messages Event Handler
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Check if it is a valid WhatsApp message structure
    const entry = payload.entry?.[0];
    const changes = entry?.changes?.[0];
    const val = changes?.value;

    if (!val || !val.messages || val.messages.length === 0) {
      // It might be a read receipt or status update, acknowledge receipt and return
      return NextResponse.json({ status: "ignored" });
    }

    const message = val.messages[0];
    const contact = val.contacts?.[0];
    const phoneId = val.metadata?.phone_number_id;

    if (!phoneId) {
      return NextResponse.json({ error: "Missing phone_number_id" }, { status: 400 });
    }

    // 1. Locate the registered WhatsApp Account in multi-tenant SaaS DB
    let waAccount = await prisma.whatsAppAccount.findFirst({
      where: { phoneId },
      include: { tenant: true },
    });

    if (!waAccount) {
      logger.info(`Received webhook event for new/unregistered phoneId: ${phoneId}. Binding to registered tenant account.`);
      waAccount = await prisma.whatsAppAccount.findFirst({
        include: { tenant: true },
      });

      if (waAccount) {
        await prisma.whatsAppAccount.update({
          where: { id: waAccount.id },
          data: { phoneId },
        }).catch((e) => logger.warn(`Failed to auto-update phoneId: ${e.message}`));
      }
    }

    if (!waAccount) {
      logger.error(`Received webhook event for unregistered phoneId: ${phoneId} and no tenant account exists.`);
      return NextResponse.json({ error: "Unregistered phone id" }, { status: 404 });
    }

    const tenantId = waAccount.tenantId;
    const fromPhone = message.from; // Customer's phone number
    const customerName = contact?.profile?.name || "WhatsApp Client";
    const bodyText = message.text?.body || "";

    if (!bodyText) {
      // Handle interactive or non-text messages if needed
      return NextResponse.json({ status: "ignored_non_text" });
    }

    // De-duplication check: prevent multiple processing of retried webhook events
    if (message.id) {
      const existingMessage = await prisma.message.findFirst({
        where: { waMessageId: message.id },
      });
      if (existingMessage) {
        logger.info(`Incoming WhatsApp message ${message.id} has already been processed. Skipping retry event.`);
        return NextResponse.json({ status: "ignored_duplicate" });
      }
    }

    // 2. Fetch or create Customer in tenant database
    const customer = await prisma.customer.upsert({
      where: {
        tenantId_waId: {
          tenantId,
          waId: fromPhone,
        },
      },
      update: {
        name: customerName,
      },
      create: {
        tenantId,
        waId: fromPhone,
        name: customerName,
      },
    });

    // 3. Fetch or create Conversation
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

    // 4. Save Customer Message to DB
    try {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          waMessageId: message.id,
          sender: "CUSTOMER",
          messageType: "TEXT",
          content: bodyText,
        },
      });
    } catch (err: any) {
      if (err.code === "P2002") {
        logger.info(`Message with ID ${message.id} already exists in DB (concurrency clash). Skipping processing.`);
        return NextResponse.json({ status: "ignored_duplicate" });
      }
      throw err;
    }

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    // Detect Stop / Opt-out request to pause automated messages
    const lowerText = bodyText.trim().toLowerCase();
    const isStopCommand = ["stop", "unsubscribe", "dont message", "don't message", "stop message", "stop follow up", "pause"].some(
      (word) => lowerText === word || lowerText.startsWith(word)
    );

    if (isStopCommand) {
      logger.info(`Customer ${fromPhone} requested Stop. Pausing automated messages (HUMAN_TAKEOVER).`);
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: "HUMAN_TAKEOVER", lastMessageAt: new Date() },
      });

      const stopReply = "Understood. We have paused automated messages for your account. If you need assistance with laptops, CCTV, or printers in the future, a human representative will follow up with you. Have a great day!";

      await sendWhatsAppTextMessage({
        accessToken: waAccount.accessToken,
        phoneId: waAccount.phoneId,
        recipientPhone: fromPhone,
        messageText: stopReply,
      });

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          sender: "AI",
          messageType: "TEXT",
          content: stopReply,
          status: "SENT",
        },
      });

      return NextResponse.json({ status: "opt_out_handled" });
    }

    // 5. If AI assistant is active, generate and send response
    if (conversation.status === "AI_ACTIVE") {
      logger.info(`AI active for conversation ${conversation.id}. Generating reply.`);
      
      const aiReply = await processCustomerMessage(tenantId, customer.id, bodyText);

      // Send via Meta Cloud API
      const sent = await sendWhatsAppTextMessage({
        accessToken: waAccount.accessToken,
        phoneId: waAccount.phoneId,
        recipientPhone: fromPhone,
        messageText: aiReply,
      });

      // Save AI Message to DB
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
    } else {
      logger.info(`AI disabled (Human Takeover) for conversation ${conversation.id}. Notification generated.`);
    }

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    logger.error(`Error processing WhatsApp webhook: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
