import { prisma } from "../db";
import { logger } from "../logger";
import jwt from "jsonwebtoken";

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SheetResponse {
  range: string;
  majorDimension: string;
  values: string[][];
}

/**
 * Exchange Google Service Account credentials for an OAuth2 Access Token.
 */
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  try {
    const creds = JSON.parse(serviceAccountJson);
    const clientEmail = creds.client_email;
    const privateKey = creds.private_key;
    const tokenUri = creds.token_uri || "https://oauth2.googleapis.com/token";

    if (!clientEmail || !privateKey) {
      throw new Error("Invalid service account JSON: missing client_email or private_key.");
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: tokenUri,
      exp: now + 3600,
      iat: now,
    };

    const assertion = jwt.sign(payload, privateKey, { algorithm: "RS256" });

    const res = await fetch(tokenUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google token exchange error: ${errText}`);
    }

    const data = (await res.json()) as GoogleTokenResponse;
    return data.access_token;
  } catch (error: any) {
    logger.error(`Failed to get Google Access Token: ${error.message}`);
    throw error;
  }
}

/**
 * Execute Google Sheets synchronization for a tenant.
 */
export async function syncGoogleSheetProducts(tenantId: string): Promise<void> {
  const config = await prisma.productSourceConfig.findUnique({
    where: { tenantId },
  });

  if (!config || config.activeSource !== "GOOGLE_SHEETS") {
    logger.info(`Google Sheets sync bypassed for tenant ${tenantId}. Active source is different.`);
    return;
  }

  const { googleSheetId, googleSheetRange, googleServiceAccountJson } = config;

  if (!googleSheetId || !googleSheetRange || !googleServiceAccountJson) {
    throw new Error("Google Sheets configurations are missing or incomplete.");
  }

  // Create Sync Job
  const connection = await prisma.serverConnection.findUnique({ where: { tenantId } });
  const syncJob = await prisma.syncJob.create({
    data: {
      serverConnectionId: connection?.id || "google-sheets-fallback-id",
      type: "INCREMENTAL",
      status: "RUNNING",
    },
  });

  // Set status in config to SYNCING
  await prisma.productSourceConfig.update({
    where: { tenantId },
    data: { status: "SYNCING" },
  });

  let total = 0;
  let updated = 0;
  let failed = 0;

  try {
    // 1. Get Access Token
    const accessToken = await getGoogleAccessToken(googleServiceAccountJson);

    // Split ranges by comma to support Sheet1, Sheet2, Sheet3 simultaneously
    const ranges = googleSheetRange.split(",").map((r) => r.trim());

    for (const range of ranges) {
      try {
        const tabName = range.includes("!") ? range.split("!")[0].replace(/['"]/g, "").trim() : range;
        const rangeEncoded = encodeURIComponent(range);
        const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values/${rangeEncoded}`;

        logger.info(`Fetching rows from Google Sheet: ${googleSheetId}, Range: ${range}`);
        const res = await fetch(sheetUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to query Google Sheets API for range ${range}. Status ${res.status}: ${errText}`);
        }

        const data = (await res.json()) as SheetResponse;
        const rows = data.values;

        if (!rows || rows.length <= 1) {
          logger.warn(`Range ${range} is empty or lacks header columns. Skipping.`);
          continue;
        }

        // Parse header mappings (first row) supporting synonyms
        const headers = rows[0].map((h) => h.trim().toLowerCase());
        
        // Synonyms for ID
        let idIdx = headers.indexOf("id");
        if (idIdx === -1) idIdx = headers.indexOf("model no");
        if (idIdx === -1) idIdx = headers.indexOf("model number");
        if (idIdx === -1) idIdx = headers.indexOf("model_no");
        if (idIdx === -1) idIdx = headers.indexOf("sl no");
        if (idIdx === -1) idIdx = headers.indexOf("sl. no");
        if (idIdx === -1) idIdx = headers.indexOf("slno");
        if (idIdx === -1) idIdx = headers.indexOf("sr no");
        if (idIdx === -1) idIdx = headers.indexOf("sr. no");
        if (idIdx === -1) idIdx = headers.indexOf("serial number");

        // Synonyms for Name
        let nameIdx = headers.indexOf("name");
        if (nameIdx === -1) nameIdx = headers.indexOf("product");
        if (nameIdx === -1) nameIdx = headers.indexOf("product name");
        if (nameIdx === -1) nameIdx = headers.indexOf("item");
        if (nameIdx === -1) nameIdx = headers.indexOf("item name");
        if (nameIdx === -1) nameIdx = headers.indexOf("title");
        if (nameIdx === -1) nameIdx = headers.indexOf("particulars");
        if (nameIdx === -1) nameIdx = headers.indexOf("description");

        // Synonyms for SKU
        let skuIdx = headers.indexOf("sku");
        if (skuIdx === -1) skuIdx = headers.indexOf("model no");
        if (skuIdx === -1) skuIdx = headers.indexOf("model number");
        if (skuIdx === -1) skuIdx = headers.indexOf("code");
        if (skuIdx === -1) skuIdx = headers.indexOf("part code");

        // Synonyms for Category
        let categoryIdx = headers.indexOf("category");
        if (categoryIdx === -1) categoryIdx = headers.indexOf("group");
        if (categoryIdx === -1) categoryIdx = headers.indexOf("department");

        // Synonyms for Price
        let priceIdx = headers.indexOf("price");
        if (priceIdx === -1) priceIdx = headers.indexOf("pdc");
        if (priceIdx === -1) priceIdx = headers.indexOf("cdc");
        if (priceIdx === -1) priceIdx = headers.indexOf("rate");
        if (priceIdx === -1) priceIdx = headers.indexOf("amount");
        if (priceIdx === -1) priceIdx = headers.indexOf("mrp");

        // Synonyms for Stock
        let stockIdx = headers.indexOf("stock");
        if (stockIdx === -1) stockIdx = headers.indexOf("qty");
        if (stockIdx === -1) stockIdx = headers.indexOf("quantity");
        if (stockIdx === -1) stockIdx = headers.indexOf("closing stock");

        // Synonyms for Description
        let descIdx = headers.indexOf("description");
        if (descIdx === -1) descIdx = headers.indexOf("remarks");
        if (descIdx === -1) descIdx = headers.indexOf("details");

        if (idIdx === -1) {
          logger.error(`Required ID header column is missing in range ${range}. Skipping.`);
          failed += rows.length - 1;
          continue;
        }

        const coreIndices = [idIdx, nameIdx, skuIdx, categoryIdx, priceIdx, stockIdx, descIdx].filter((idx) => idx !== -1);
        const productRows = rows.slice(1);
        total += productRows.length;

        for (const row of productRows) {
          try {
            const idVal = row[idIdx]?.trim();
            if (!idVal) {
              failed++;
              continue;
            }

            // Create unique ID prefixed with the spreadsheet tab name to prevent overlap overwrites
            const finalId = `${tabName}_${idVal}`;

            const nameVal = nameIdx !== -1 && row[nameIdx] ? row[nameIdx].trim() : `Product ${idVal}`;
            const skuVal = skuIdx !== -1 && row[skuIdx] ? row[skuIdx].trim() : "";
            const categoryVal = categoryIdx !== -1 && row[categoryIdx] ? row[categoryIdx].trim() : "";
            const priceVal = priceIdx !== -1 && row[priceIdx] ? parseFloat(row[priceIdx].trim().replace(/[$,]/g, "") || "0") : 0;
            const stockVal = stockIdx !== -1 && row[stockIdx] ? parseInt(row[stockIdx].trim().replace(/,/g, "") || "0", 10) : 0;
            const descVal = descIdx !== -1 && row[descIdx] ? row[descIdx].trim() : "";

            // Capture all other columns dynamically as specifications (admin custom attributes)
            const specs: Record<string, string> = {};
            headers.forEach((header, idx) => {
              const lowerH = header.trim().toLowerCase();
              if (lowerH === "cdc" && row[idx] !== undefined) {
                specs["CDC"] = String(row[idx]).trim();
              }
              if (lowerH === "pdc" && row[idx] !== undefined) {
                specs["PDC"] = String(row[idx]).trim();
              }
              if (!coreIndices.includes(idx) && row[idx] !== undefined && row[idx] !== null) {
                const displayName = header
                  .replace(/[_-]/g, " ")
                  .split(" ")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ");
                specs[displayName] = String(row[idx]).trim();
              }
            });
            const specsJson = JSON.stringify(specs);

            // Sync category
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

            // Check cache values
            const currentProd = await prisma.product.findUnique({
              where: {
                tenantId_localId: { tenantId, localId: finalId },
              },
            });

            // Trigger updates if attributes changed
            const hasChanges =
              !currentProd ||
              currentProd.name !== nameVal ||
              currentProd.price !== priceVal ||
              currentProd.stock !== stockVal ||
              currentProd.sku !== skuVal ||
              currentProd.description !== descVal ||
              currentProd.categoryId !== categoryId ||
              currentProd.specifications !== specsJson;

            if (hasChanges) {
              await prisma.product.upsert({
                where: {
                  tenantId_localId: { tenantId, localId: finalId },
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
                  version: (currentProd?.version || 1) + 1,
                  syncSource: "GOOGLE_SHEETS",
                  updatedAt: new Date(),
                },
                create: {
                  tenantId,
                  localId: finalId,
                  name: nameVal,
                  sku: skuVal || null,
                  description: descVal || null,
                  price: priceVal,
                  stock: stockVal,
                  categoryId,
                  specifications: specsJson,
                  isAvailable: true,
                  version: 1,
                  syncSource: "GOOGLE_SHEETS",
                },
              });

              updated++;
              await prisma.syncJobLog.create({
                data: {
                  syncJobId: syncJob.id,
                  action: currentProd ? "UPDATE" : "CREATE",
                  entityType: "PRODUCT",
                  entityId: finalId,
                  success: true,
                },
              });
            }
          } catch (err: any) {
            failed++;
            logger.error(`Row sync failed inside Google Sheet range ${range}: ${err.message}`);
          }
        }
      } catch (rangeErr: any) {
        logger.error(`Failed to process range ${range}: ${rangeErr.message}`);
      }
    }

    // Complete config status
    await prisma.productSourceConfig.update({
      where: { tenantId },
      data: {
        status: "IDLE",
        lastSyncAt: new Date(),
        nextSyncAt: new Date(Date.now() + config.syncIntervalMinutes * 60 * 1000),
        lastError: null,
      },
    });

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
        totalRecords: total,
        updatedRecords: updated,
        failedRecords: failed,
      },
    });

  } catch (error: any) {
    logger.error(`Google Sheets Sync Job failed for tenant ${tenantId}: ${error.message}`);
    
    await prisma.productSourceConfig.update({
      where: { tenantId },
      data: {
        status: "ERROR",
        lastError: error.message,
      },
    });

    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "FAILED",
        endedAt: new Date(),
        totalRecords: total,
        updatedRecords: updated,
        failedRecords: failed,
      },
    });

    await prisma.notification.create({
      data: {
        tenantId,
        type: "SYNC_FAILED",
        message: `Google Sheets sync failed for tenant. Connection Status: Offline cache fallback active. Error: ${error.message}`,
      },
    });
  }
}
