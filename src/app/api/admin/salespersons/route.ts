import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * GET list of salespersons
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

    const salespersons = await prisma.salesperson.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, salespersons });
  } catch (error: any) {
    logger.error(`Get Salespersons Error: ${error.message}`);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST add new salesperson
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

    const { name, phone, specialization } = await req.json();

    if (!name || !phone || !specialization) {
      return NextResponse.json({ error: "Missing required fields (name, phone, specialization)" }, { status: 400 });
    }

    const salesperson = await prisma.salesperson.create({
      data: {
        tenantId,
        name: String(name).trim(),
        phone: String(phone).trim(),
        specialization: String(specialization).trim(),
      },
    });

    return NextResponse.json({ success: true, salesperson });
  } catch (error: any) {
    logger.error(`Add Salesperson Error: ${error.message}`);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE salesperson
 */
export async function DELETE(req: NextRequest) {
  try {
    let tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      const fallbackTenant = await prisma.tenant.findFirst();
      tenantId = fallbackTenant?.id || "";
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant context not found" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing salesperson ID" }, { status: 400 });
    }

    // Verify ownership
    const existing = await prisma.salesperson.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Salesperson not found" }, { status: 404 });
    }

    await prisma.salesperson.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Salesperson deleted successfully" });
  } catch (error: any) {
    logger.error(`Delete Salesperson Error: ${error.message}`);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
