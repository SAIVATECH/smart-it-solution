import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { syncGoogleSheetProducts } from "@/lib/sync/googleSheetsSync";

/**
 * GET current active configurations
 */
export async function GET(req: NextRequest) {
  try {
    let tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      const fallbackTenant = await prisma.tenant.findFirst();
      tenantId = fallbackTenant?.id || "";
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant context not found" }, { status: 400 });
    }

    let config = await prisma.productSourceConfig.findUnique({
      where: { tenantId },
    });

    if (!config) {
      config = await prisma.productSourceConfig.create({
        data: { tenantId },
      });
    }

    let aiSettings = await prisma.aISettings.findUnique({
      where: { tenantId },
    });

    if (!aiSettings) {
      aiSettings = await prisma.aISettings.create({
        data: {
          tenantId,
          systemPrompt: "You are an AI Sales Assistant representing our company. Talk like a professional human sales executive—polite, humble, knowledgeable, persuasive, but never pushy. Understand customer needs first. Explain products clearly with benefits and comparisons. If the user is still unsure or asks for a human, offer a warm handover and share the sales contact number. That number should be managed from the Admin Dashboard. Support discounts configured in the dashboard—by product, brand, category, quantity, or promotions. Apply them automatically. GST is 18% by default, but must be editable in the dashboard. Do not mention stock counts; if a product exists in the configured data source, show it as available. Do not invent missing data. If details are missing, say so and offer a human handover. Always aim for clarity, trust, and conversion.",
          fallbackPrompt: "I am having trouble accessing our product databases right now, but let me check that details for you and I'll notify a human sales agent to follow up right away.",
        },
      });
    }

    return NextResponse.json({ success: true, config, aiSettings });
  } catch (error: any) {
    logger.error(`Get Source Config Error: ${error.message}`);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST save active configurations & credentials
 */
export async function POST(req: NextRequest) {
  try {
    let tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      const fallbackTenant = await prisma.tenant.findFirst();
      tenantId = fallbackTenant?.id || "";
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant context not found" }, { status: 400 });
    }

    const {
      activeSource,
      googleSheetId,
      googleSheetRange,
      googleServiceAccountJson,
      syncIntervalMinutes,
      triggerSyncNow,
      contactPhone,
      gstRate,
    } = await req.json();

    const config = await prisma.productSourceConfig.upsert({
      where: { tenantId },
      update: {
        activeSource,
        googleSheetId,
        googleSheetRange,
        googleServiceAccountJson,
        syncIntervalMinutes: parseInt(String(syncIntervalMinutes || "5"), 10),
      },
      create: {
        tenantId,
        activeSource,
        googleSheetId,
        googleSheetRange,
        googleServiceAccountJson,
        syncIntervalMinutes: parseInt(String(syncIntervalMinutes || "5"), 10),
      },
    });

    let aiSettings = null;
    if (contactPhone !== undefined || gstRate !== undefined) {
      aiSettings = await prisma.aISettings.upsert({
        where: { tenantId },
        update: {
          contactPhone,
          gstRate: gstRate !== undefined ? parseFloat(String(gstRate)) : 18.0,
        },
        create: {
          tenantId,
          systemPrompt: "You are an AI Sales Assistant representing our company. Talk like a professional human sales executive—polite, humble, knowledgeable, persuasive, but never pushy. Understand customer needs first. Explain products clearly with benefits and comparisons. If the user is still unsure or asks for a human, offer a warm handover and share the sales contact number. That number should be managed from the Admin Dashboard. Support discounts configured in the dashboard—by product, brand, category, quantity, or promotions. Apply them automatically. GST is 18% by default, but must be editable in the dashboard. Do not mention stock counts; if a product exists in the configured data source, show it as available. Do not invent missing data. If details are missing, say so and offer a human handover. Always aim for clarity, trust, and conversion.",
          fallbackPrompt: "I am having trouble accessing our product databases right now, but let me check that details for you and I'll notify a human sales agent to follow up right away.",
          contactPhone,
          gstRate: gstRate !== undefined ? parseFloat(String(gstRate)) : 18.0,
        },
      });
    }

    // Write audit logs
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: "UPDATE_SOURCE_CONFIG",
        details: `Updated active product source config to: ${activeSource} and AI settings`,
      },
    });

    // If Google Sheet sync is chosen and user triggered sync, execute it synchronously
    if (activeSource === "GOOGLE_SHEETS" && triggerSyncNow) {
      try {
        await syncGoogleSheetProducts(tenantId);
        // Reload configuration
        const updatedConfig = await prisma.productSourceConfig.findUnique({ where: { tenantId } });
        return NextResponse.json({ success: true, config: updatedConfig, aiSettings, syncTriggered: true });
      } catch (err: any) {
        return NextResponse.json({ success: true, config, aiSettings, syncError: err.message });
      }
    }

    return NextResponse.json({ success: true, config, aiSettings });
  } catch (error: any) {
    logger.error(`Save Source Config Error: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
