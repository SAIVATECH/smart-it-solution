import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkLocalServerHealth, runIncrementalSync } from "@/lib/sync/syncEngine";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/whatsappService";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const { action, conversationId, status, messageText, tenantId: requestedTenantId } = await req.json();

    let tenantId = requestedTenantId || req.headers.get("x-tenant-id");
    if (!tenantId) {
      const fallbackTenant = await prisma.tenant.findFirst();
      tenantId = fallbackTenant?.id;
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant context not found" }, { status: 400 });
    }

    if (action === "HEALTH_CHECK") {
      const isOnline = await checkLocalServerHealth(tenantId);
      return NextResponse.json({ success: true, isOnline });
    }

    if (action === "SYNC_NOW") {
      await runIncrementalSync(tenantId);
      return NextResponse.json({ success: true, message: "Sync job completed" });
    }

    if (action === "TOGGLE_AI") {
      if (!conversationId || !status) {
        return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
      }
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status },
      });
      return NextResponse.json({ success: true, status });
    }

    if (action === "SEND_MESSAGE") {
      if (!conversationId || !messageText) {
        return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true },
      });

      const waAccount = await prisma.whatsAppAccount.findFirst({
        where: { tenantId },
      });

      if (!conversation || !waAccount) {
        return NextResponse.json({ error: "Invalid conversation or WA account configuration" }, { status: 404 });
      }

      // Send to recipient
      const sent = await sendWhatsAppTextMessage({
        accessToken: waAccount.accessToken,
        phoneId: waAccount.phoneId,
        recipientPhone: conversation.customer.waId,
        messageText,
      });

      // Save Message to DB
      const msg = await prisma.message.create({
        data: {
          conversationId,
          sender: "HUMAN",
          messageType: "TEXT",
          content: messageText,
          status: sent ? "SENT" : "FAILED",
        },
      });

      // Update last message timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });

      return NextResponse.json({ success: true, message: msg });
    }

    return NextResponse.json({ error: "Unsupported action type" }, { status: 400 });
  } catch (error: any) {
    logger.error(`Admin Action API Error: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
