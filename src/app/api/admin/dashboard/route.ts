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

    // 7. Audit log summary & Token Usage aggregation
    const [auditLogs, tokenLogs, aiSettings] = await Promise.all([
      prisma.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.auditLog.findMany({
        where: { tenantId, action: "AI_TOKEN_USAGE" },
      }),
      prisma.aISettings.findUnique({
        where: { tenantId },
      }),
    ]);

    let promptTokens = 0;
    let completionTokens = 0;
    const totalRequests = tokenLogs.length;

    for (const log of tokenLogs) {
      try {
        const details = JSON.parse(log.details || "{}");
        promptTokens += details.promptTokens || 0;
        completionTokens += details.completionTokens || 0;
      } catch (e) {}
    }

    const totalTokens = promptTokens + completionTokens;
    const dailyQuota = 1000000;

    // 8. Get white-label branding configurations
    const branding = await prisma.brandingSettings.findUnique({
      where: { tenantId },
    });

    return NextResponse.json({
      success: true,
      branding: branding || {
        brandName: "Smart IT Solutions",
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
        revenue: 4298.5,
        aiAccuracy: 94.5,
        tokenUsage: {
          totalTokens,
          promptTokens,
          completionTokens,
          totalRequests,
          activeModel: aiSettings?.modelName || "gemini-2.0-flash",
          dailyQuota,
          quotaUsedPercent: Number(((totalTokens / dailyQuota) * 100).toFixed(4)),
        },
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
