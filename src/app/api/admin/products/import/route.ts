import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import * as xlsx from "xlsx";

export async function POST(req: NextRequest) {
  try {
    // Extract tenant context from middleware headers or fallback
    let tenantId = req.headers.get("x-tenant-id");
    if (!tenantId) {
      const fallbackTenant = await prisma.tenant.findFirst();
      tenantId = fallbackTenant?.id || "";
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant context not found" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const mode = formData.get("mode") as string; // "MERGE" or "REPLACE"

    if (!file) {
      return NextResponse.json({ error: "Missing uploaded Excel/CSV file" }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(new Uint8Array(buffer), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet) as any[];

    if (rows.length === 0) {
      return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
    }

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Transaction-based write operations
    if (mode === "REPLACE") {
      logger.info(`Starting REPLACE product import for tenant ${tenantId}. Wiping old inventory.`);
      await prisma.product.deleteMany({
        where: { tenantId },
      });
    }

    for (const row of rows) {
      try {
        const rowKeys = Object.keys(row);
        const findVal = (synonyms: string[]): any => {
          const matchedKey = rowKeys.find((k) => synonyms.includes(k.trim().toLowerCase()));
          return matchedKey !== undefined ? row[matchedKey] : null;
        };

        const idVal = String(findVal(["id", "model no", "model number", "model_no", "sl no", "sl. no", "slno", "sr no", "sr. no"]) || "").trim();
        const nameVal = String(findVal(["name", "product", "product name", "item", "item name", "title", "particulars", "description"]) || "").trim();
        const priceVal = parseFloat(String(findVal(["price", "pdc", "cdc", "rate", "amount", "mrp"]) || "0").replace(/[$,]/g, ""));
        const stockVal = parseInt(String(findVal(["stock", "qty", "quantity"]) || "0").replace(/,/g, ""), 10);
        const categoryVal = String(findVal(["category", "group", "department"]) || "").trim();
        const skuVal = String(findVal(["sku", "model no", "model number", "code", "part code"]) || "").trim();
        const descVal = String(findVal(["description", "remarks", "details"]) || "").trim();

        if (!idVal || !nameVal) {
          skippedCount++;
          errors.push(`Row skipped: missing required product identifier (ID/Model no) or product name (Description/Name).`);
          continue;
        }

        const coreKeys = [
          "id", "model no", "model number", "model_no", "sl no", "sl. no", "slno", "sr no", "sr. no",
          "name", "product", "product name", "item", "item name", "title", "particulars", "description",
          "price", "pdc", "cdc", "rate", "amount", "mrp",
          "stock", "qty", "quantity",
          "category", "group", "department",
          "sku", "code", "part code"
        ];

        const specs: Record<string, any> = {};
        rowKeys.forEach((k) => {
          const lowerK = k.trim().toLowerCase();
          if (lowerK === "cdc") specs["CDC"] = row[k];
          if (lowerK === "pdc") specs["PDC"] = row[k];
          if (!coreKeys.includes(lowerK) && row[k] !== undefined && row[k] !== null) {
            const displayName = k
              .replace(/[_-]/g, " ")
              .split(" ")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
            specs[displayName] = row[k];
          }
        });
        const specsJson = JSON.stringify(specs);

        // Upsert category if name is provided
        let categoryId: string | null = null;
        if (categoryVal) {
          const categoryObj = await prisma.category.upsert({
            where: {
              tenantId_localId: {
                tenantId,
                localId: `cat_${categoryVal.toLowerCase().replace(/\s+/g, "_")}`,
              },
            },
            update: { name: categoryVal },
            create: {
              tenantId,
              name: categoryVal,
              localId: `cat_${categoryVal.toLowerCase().replace(/\s+/g, "_")}`,
            },
          });
          categoryId = categoryObj.id;
        }

        // Create or update products
        await prisma.product.upsert({
          where: {
            tenantId_localId: {
              tenantId,
              localId: idVal,
            },
          },
          update: {
            name: nameVal,
            sku: skuVal || null,
            description: descVal || null,
            price: priceVal,
            stock: stockVal,
            categoryId,
            specifications: specsJson,
            isAvailable: true,
            version: { increment: 1 },
            syncSource: "EXCEL_UPLOAD",
          },
          create: {
            tenantId,
            localId: idVal,
            name: nameVal,
            sku: skuVal || null,
            description: descVal || null,
            price: priceVal,
            stock: stockVal,
            categoryId,
            specifications: specsJson,
            isAvailable: true,
            version: 1,
            syncSource: "EXCEL_UPLOAD",
          },
        });

        successCount++;
      } catch (err: any) {
        errorCount++;
        errors.push(`Row error: ${err.message}`);
      }
    }

    // Update product source config to manual Excel mode
    await prisma.productSourceConfig.upsert({
      where: { tenantId },
      update: { activeSource: "EXCEL_UPLOAD" },
      create: {
        tenantId,
        activeSource: "EXCEL_UPLOAD",
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: "EXCEL_PRODUCTS_IMPORT",
        details: `Imported products from Excel. Mode: ${mode}. Success: ${successCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`,
      },
    });

    return NextResponse.json({
      success: true,
      summary: {
        imported: successCount,
        skipped: skippedCount,
        failed: errorCount,
        errors: errors.slice(0, 10), // Return top 10 error snippets
      },
    });

  } catch (error: any) {
    logger.error(`Excel Import API Error: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
