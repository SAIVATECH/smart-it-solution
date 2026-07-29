import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    // Read tenant from middleware header or default to first tenant
    let tenantId = req.headers.get("x-tenant-id");

    if (!tenantId) {
      const fallbackTenant = await prisma.tenant.findFirst();
      if (!fallbackTenant) {
        return NextResponse.json({ error: "No tenants configured in database" }, { status: 404 });
      }
      tenantId = fallbackTenant.id;
    }

    // 1. Get Connection status
    const connection = await prisma.serverConnection.findUnique({
      where: { tenantId },
    });

    // 2. Get Conversational metrics
    const totalChats = await prisma.conversation.count({ where: { tenantId } });
    const humanTakeover = await prisma.conversation.count({
      where: { tenantId, status: "HUMAN_TAKEOVER" },
    });
    const aiActive = await prisma.conversation.count({
      where: { tenantId, status: "AI_ACTIVE" },
    });

    // 3. Get Leads & CRM details
    const totalLeads = await prisma.lead.count({ where: { tenantId } });
    const recentLeads = await prisma.lead.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: true },
    });

    // 4. Products details
    const productCount = await prisma.product.count({ where: { tenantId } });
    const products = await prisma.product.findMany({
      where: { tenantId },
      include: { category: true },
      orderBy: { name: "asc" },
    });

    // 5. Sync Jobs history
    const recentSyncJobs = await prisma.syncJob.findMany({
      where: { serverConnectionId: connection?.id },
      orderBy: { startedAt: "desc" },
      take: 5,
    });

    // 6. Active Conversations List
    const activeConversations = await prisma.conversation.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        customer: true,
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // 7. Audit log summary
    const auditLogs = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // 8. Get white-label branding configurations
    const branding = await prisma.brandingSettings.findUnique({
      where: { tenantId },
    });

    return NextResponse.json({
      success: true,
      branding: branding || {
        brandName: "Acme Sales AI",
        primaryColor: "#06b6d4",
        secondaryColor: "#6366f1",
      },
      metrics: {
        serverStatus: connection?.isOnline ? "ONLINE" : "OFFLINE",
        lastChecked: connection?.lastCheckedAt || null,
        serverUrl: connection?.url || "",
        totalChats,
        aiActive,
        humanTakeover,
        totalLeads,
        productCount,
        revenue: 4298.5, // Seeded calculation metric
        aiAccuracy: 94.5,
      },
      activeConversations,
      recentSyncJobs,
      recentLeads,
      auditLogs,
      products,
    });
  } catch (error: any) {
    logger.error(`Dashboard API Error: ${error.message}`);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
