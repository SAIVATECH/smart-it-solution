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

    // Dynamic Header Detection: Find the index of the row containing column headers
    const raw2D = xlsx.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (raw2D.length === 0) {
      return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
    }

    let headerRowIndex = 0;
    const tableHeaderRequiredPairs = [
      ["category", "description"],
      ["category", "model"],
      ["model no", "description"],
      ["model", "description"],
      ["sl no", "description"],
      ["sr no", "particulars"],
      ["product", "price"],
      ["item", "price"],
    ];

    for (let i = 0; i < Math.min(raw2D.length, 30); i++) {
      const rowCells = (raw2D[i] || []).map(cell => String(cell || "").trim().toLowerCase());
      const isHeaderRow = tableHeaderRequiredPairs.some(([k1, k2]) =>
        rowCells.some(cell => cell.includes(k1)) && rowCells.some(cell => cell.includes(k2))
      );
      if (isHeaderRow) {
        headerRowIndex = i;
        logger.info(`Detected Excel table header at row ${i}: "${raw2D[i]?.join(" | ")}"`);
        break;
      }
    }

    // Extract structured objects starting from the detected header row range
    const rows = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex }) as any[];

    if (rows.length === 0) {
      return NextResponse.json({ error: "Uploaded file is empty or contains no product rows" }, { status: 400 });
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

    // Category cache to minimize database connection roundtrips
    const categoryCache = new Map<string, string>();

    const processedItems: Array<{
      localId: string;
      name: string;
      sku: string | null;
      description: string | null;
      price: number;
      stock: number;
      categoryVal: string;
      specsJson: string;
    }> = [];

    for (const row of rows) {
      try {
        const rowKeys = Object.keys(row);
        const findVal = (synonyms: string[]): any => {
          for (const syn of synonyms) {
            const matchedKey = rowKeys.find((k) => k.trim().toLowerCase() === syn.toLowerCase());
            if (matchedKey !== undefined && row[matchedKey] !== undefined && row[matchedKey] !== null && String(row[matchedKey]).trim().length > 0) {
              return row[matchedKey];
            }
          }
          return null;
        };

        let idVal = String(findVal([
          "model no", "model number", "model_no", "model", "model name", "id",
          "sl no", "sl. no", "slno", "sr no", "sr. no", "s.no", "sno",
          "code", "part code", "item code", "product code", "sku"
        ]) || "").trim();

        let nameVal = String(findVal([
          "description", "product description", "particulars", "name", "product name", "item name", "item", "product", "title",
          "details", "specification", "specifications"
        ]) || "").trim();

        const priceVal = parseFloat(String(findVal(["dealer price excl. gst (₹)", "dealer final price (incl. 18% gst)", "landing cost nlc (₹)", "price", "pdc", "cdc", "rate", "amount", "mrp", "dealer price", "unit price", "landing cost", "nlc"]) || "0").replace(/[$,]/g, ""));
        const stockVal = parseInt(String(findVal(["stock", "qty", "quantity"]) || "0").replace(/,/g, ""), 10);
        const categoryVal = String(findVal(["category", "group", "department", "type"]) || "").trim();
        const skuVal = String(findVal(["sku", "code", "part code", "model no", "model number", "model"]) || "").trim();
        const descVal = String(findVal(["description", "remarks", "details", "particulars", "specification"]) || "").trim();

        // Smart fallbacks: if product description is present but explicit ID is missing
        if (!nameVal && idVal) {
          nameVal = idVal;
        }
        if (!idVal && nameVal) {
          idVal = nameVal.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 50);
        }

        // Only skip if row has neither a product name nor an ID
        if (!nameVal && !idVal) {
          skippedCount++;
          errors.push(`Row skipped: empty row or missing product description/model name.`);
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

        processedItems.push({
          localId: idVal,
          name: nameVal,
          sku: skuVal || null,
          description: descVal || null,
          price: priceVal,
          stock: stockVal,
          categoryVal,
          specsJson: JSON.stringify(specs),
        });
      } catch (err: any) {
        errorCount++;
        errors.push(`Row parsing error: ${err.message}`);
      }
    }

    // Process database writes sequentially for items with category caching
    for (const item of processedItems) {
      try {
        let categoryId: string | null = null;
        if (item.categoryVal) {
          const catKey = item.categoryVal.toLowerCase().replace(/\s+/g, "_");
          if (categoryCache.has(catKey)) {
            categoryId = categoryCache.get(catKey)!;
          } else {
            const categoryObj = await prisma.category.upsert({
              where: {
                tenantId_localId: {
                  tenantId,
                  localId: `cat_${catKey}`,
                },
              },
              update: { name: item.categoryVal },
              create: {
                tenantId,
                name: item.categoryVal,
                localId: `cat_${catKey}`,
              },
            });
            categoryId = categoryObj.id;
            categoryCache.set(catKey, categoryId);
          }
        }

        await prisma.product.upsert({
          where: {
            tenantId_localId: {
              tenantId,
              localId: item.localId,
            },
          },
          update: {
            name: item.name,
            sku: item.sku,
            description: item.description,
            price: item.price,
            stock: item.stock,
            categoryId,
            specifications: item.specsJson,
            isAvailable: true,
            version: { increment: 1 },
            syncSource: "EXCEL_UPLOAD",
          },
          create: {
            tenantId,
            localId: item.localId,
            name: item.name,
            sku: item.sku,
            description: item.description,
            price: item.price,
            stock: item.stock,
            categoryId,
            specifications: item.specsJson,
            isAvailable: true,
            version: 1,
            syncSource: "EXCEL_UPLOAD",
          },
        });

        successCount++;
      } catch (err: any) {
        errorCount++;
        errors.push(`Product DB write error (${item.name}): ${err.message}`);
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
