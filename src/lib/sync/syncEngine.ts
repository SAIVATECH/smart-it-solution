import { prisma } from "../db";
import { logger } from "../logger";

export interface LocalProductPayload {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  price: number;
  stock: number;
  categoryName?: string;
  categoryId?: string;
  specifications?: any;
  offers?: any;
  discount?: number;
  gst?: number;
  updatedAt: string;
  version: number;
}

/**
 * Checks the health of the local server connection.
 * Runs every 30 seconds (triggered by BullMQ/scheduler).
 */
export async function checkLocalServerHealth(tenantId: string): Promise<boolean> {
  const connection = await prisma.serverConnection.findUnique({
    where: { tenantId },
  });

  if (!connection) {
    logger.warn(`No server connection config found for tenant ${tenantId}`);
    return false;
  }

  let isOnlineNow = false;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), connection.timeout);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (connection.authType === "API_KEY" && connection.credentials) {
      const creds = JSON.parse(connection.credentials);
      if (creds.apiKey) {
        headers["x-api-key"] = creds.apiKey;
      }
    }

    // Ping the configured server URL (adding a /health or ping path as appropriate)
    const pingUrl = connection.url.endsWith("/") ? `${connection.url}health` : `${connection.url}/health`;
    
    logger.info(`Checking health for tenant ${tenantId} at ${pingUrl}`);
    const res = await fetch(pingUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    isOnlineNow = res.ok;
  } catch (error: any) {
    logger.error(`Health check failed for tenant ${tenantId}: ${error.message}`);
    isOnlineNow = false;
  } finally {
    clearTimeout(id);
  }

  const wasOnline = connection.isOnline;
  
  // Update server connection online status
  await prisma.serverConnection.update({
    where: { tenantId },
    data: {
      isOnline: isOnlineNow,
      lastCheckedAt: new Date(),
    },
  });

  // Handle state changes
  if (wasOnline && !isOnlineNow) {
    logger.warn(`Tenant ${tenantId} server went OFFLINE. Switching to Cloud Cache.`);
    await prisma.notification.create({
      data: {
        tenantId,
        type: "SERVER_OFFLINE",
        message: `Local server connection failed. Switched to offline cloud cache. URL: ${connection.url}`,
      },
    });
  } else if (!wasOnline && isOnlineNow) {
    logger.info(`Tenant ${tenantId} server returned ONLINE. Syncing differences...`);
    // Run incremental sync and push offline data immediately
    await runIncrementalSync(tenantId);
    await pushOfflineWritesToLocal(tenantId);
  }

  return isOnlineNow;
}

/**
 * Performs incremental sync of products from local server to Cloud DB.
 */
export async function runIncrementalSync(tenantId: string): Promise<void> {
  const connection = await prisma.serverConnection.findUnique({
    where: { tenantId },
  });

  if (!connection || !connection.isOnline) {
    logger.info(`Skipping sync for tenant ${tenantId} (Server is offline or config missing).`);
    return;
  }

  // Create Sync Job
  const syncJob = await prisma.syncJob.create({
    data: {
      serverConnectionId: connection.id,
      type: "INCREMENTAL",
      status: "RUNNING",
    },
  });

  let total = 0;
  let updated = 0;
  let deleted = 0;
  let failed = 0;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (connection.authType === "API_KEY" && connection.credentials) {
      const creds = JSON.parse(connection.credentials);
      if (creds.apiKey) {
        headers["x-api-key"] = creds.apiKey;
      }
    }

    const productsUrl = connection.url.endsWith("/") ? `${connection.url}products` : `${connection.url}/products`;
    const res = await fetch(productsUrl, { headers });

    if (!res.ok) {
      throw new Error(`Failed to fetch products from local server. Status: ${res.status}`);
    }

    const localProducts = (await res.json()) as LocalProductPayload[];
    total = localProducts.length;

    for (const localProd of localProducts) {
      try {
        // Find existing product in Cloud Database
        const cloudProd = await prisma.product.findUnique({
          where: {
            tenantId_localId: {
              tenantId,
              localId: localProd.id,
            },
          },
        });

        // Version-based / Timestamp conflict check
        if (!cloudProd || cloudProd.version < localProd.version) {
          // Sync or create category
          let categoryId: string | null = null;
          if (localProd.categoryName) {
            const category = await prisma.category.upsert({
              where: {
                tenantId_localId: {
                  tenantId,
                  localId: localProd.categoryId || `cat_${localProd.categoryName.toLowerCase().replace(/\s+/g, "_")}`,
                },
              },
              update: { name: localProd.categoryName },
              create: {
                tenantId,
                name: localProd.categoryName,
                localId: localProd.categoryId || `cat_${localProd.categoryName.toLowerCase().replace(/\s+/g, "_")}`,
              },
            });
            categoryId = category.id;
          }

          // Upsert product
          await prisma.product.upsert({
            where: {
              tenantId_localId: {
                tenantId,
                localId: localProd.id,
              },
            },
            update: {
              name: localProd.name,
              description: localProd.description,
              sku: localProd.sku,
              price: localProd.price,
              stock: localProd.stock,
              categoryId,
              specifications: localProd.specifications ? JSON.stringify(localProd.specifications) : null,
              offers: localProd.offers ? JSON.stringify(localProd.offers) : null,
              discount: localProd.discount || 0,
              gst: localProd.gst || 0,
              isAvailable: localProd.stock > 0,
              version: localProd.version,
              syncSource: "LOCAL",
              updatedAt: new Date(localProd.updatedAt),
            },
            create: {
              tenantId,
              localId: localProd.id,
              name: localProd.name,
              description: localProd.description,
              sku: localProd.sku,
              price: localProd.price,
              stock: localProd.stock,
              categoryId,
              specifications: localProd.specifications ? JSON.stringify(localProd.specifications) : null,
              offers: localProd.offers ? JSON.stringify(localProd.offers) : null,
              discount: localProd.discount || 0,
              gst: localProd.gst || 0,
              isAvailable: localProd.stock > 0,
              version: localProd.version,
              syncSource: "LOCAL",
              createdAt: new Date(localProd.updatedAt),
              updatedAt: new Date(localProd.updatedAt),
            },
          });

          updated++;
          await prisma.syncJobLog.create({
            data: {
              syncJobId: syncJob.id,
              action: cloudProd ? "UPDATE" : "CREATE",
              entityType: "PRODUCT",
              entityId: localProd.id,
              success: true,
            },
          });
        }
      } catch (err: any) {
        failed++;
        await prisma.syncJobLog.create({
          data: {
            syncJobId: syncJob.id,
            action: "FAIL",
            entityType: "PRODUCT",
            entityId: localProd.id,
            success: false,
            errorMsg: err.message,
          },
        });
      }
    }

    // Complete Sync Job
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "COMPLETED",
        endedAt: new Date(),
        totalRecords: total,
        updatedRecords: updated,
        deletedRecords: deleted,
        failedRecords: failed,
      },
    });

  } catch (error: any) {
    logger.error(`Sync Job ${syncJob.id} failed: ${error.message}`);
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: "FAILED",
        endedAt: new Date(),
        totalRecords: total,
        updatedRecords: updated,
        deletedRecords: deleted,
        failedRecords: failed,
      },
    });

    await prisma.notification.create({
      data: {
        tenantId,
        type: "SYNC_FAILED",
        message: `Sync failed for tenant. Error: ${error.message}`,
      },
    });
  }
}

/**
 * Pushes offline leads/orders back to the local database once online.
 */
export async function pushOfflineWritesToLocal(tenantId: string): Promise<void> {
  const connection = await prisma.serverConnection.findUnique({
    where: { tenantId },
  });

  if (!connection || !connection.isOnline) return;

  // Find unsynced orders
  const pendingOrders = await prisma.order.findMany({
    where: {
      tenantId,
      syncStatus: "PENDING",
    },
    include: {
      customer: true,
    },
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (connection.authType === "API_KEY" && connection.credentials) {
    const creds = JSON.parse(connection.credentials);
    headers["x-api-key"] = creds.apiKey;
  }

  for (const order of pendingOrders) {
    try {
      const orderSyncUrl = connection.url.endsWith("/") ? `${connection.url}orders` : `${connection.url}/orders`;
      
      const res = await fetch(orderSyncUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          cloudOrderId: order.id,
          waId: order.customer.waId,
          customerName: order.customer.name,
          amount: order.totalAmount,
          createdAt: order.createdAt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        await prisma.order.update({
          where: { id: order.id },
          data: {
            syncStatus: "SYNCED",
            localOrderId: data.localOrderId || null,
          },
        });
        logger.info(`Successfully synced order ${order.id} to local server.`);
      }
    } catch (err: any) {
      logger.error(`Failed to push offline order ${order.id} to local server: ${err.message}`);
    }
  }
}

/**
 * Data Fetch API supporting offline cache transparency.
 * AI or catalog queries use this helper.
 */
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[len1][len2];
}

export async function getProductCatalog(tenantId: string, search?: string) {
  // Query Cloud Database cache
  let searchConstraint = {};
  if (search) {
    const words = search.split(/\s+/).filter(Boolean);
    if (words.length > 0) {
      searchConstraint = {
        AND: words.map((word) => {
          const match = word.match(/^(\d+)([a-zA-Z]+)$/);
          if (match) {
            const num = match[1];
            const unit = match[2];
            const spaceWord = `${num} ${unit}`;
            return {
              OR: [
                { name: { contains: word, mode: "insensitive" } },
                { name: { contains: spaceWord, mode: "insensitive" } },
                { description: { contains: word, mode: "insensitive" } },
                { description: { contains: spaceWord, mode: "insensitive" } },
                { specifications: { contains: word, mode: "insensitive" } },
                { specifications: { contains: spaceWord, mode: "insensitive" } },
              ],
            };
          }
          return {
            OR: [
              { name: { contains: word, mode: "insensitive" } },
              { description: { contains: word, mode: "insensitive" } },
              { specifications: { contains: word, mode: "insensitive" } },
            ],
          };
        }),
      };
    }
  }

  const exactProducts = await prisma.product.findMany({
    where: {
      tenantId,
      isAvailable: true,
      ...searchConstraint,
    },
    include: {
      category: true,
      variants: true,
    },
  });

  if (exactProducts.length > 0) {
    return exactProducts;
  }

  // If no exact match and search term is provided, run fuzzy Levenshtein matching
  if (search) {
    const searchWords = search.toLowerCase().split(/\s+/).filter(Boolean);
    if (searchWords.length > 0) {
      const allProducts = await prisma.product.findMany({
        where: {
          tenantId,
          isAvailable: true,
        },
        include: {
          category: true,
          variants: true,
        },
      });

      const matchedWithScores = allProducts.map((p) => {
        const textToMatch = `${p.name} ${p.description || ""} ${p.specifications || ""}`.toLowerCase();
        const targetWords = textToMatch.split(/[\s,.\-_/()]+/).filter(Boolean);

        let totalScore = 0;
        let matchedAll = true;

        for (const sWord of searchWords) {
          let bestDist = 999;
          for (const tWord of targetWords) {
            const dist = levenshteinDistance(sWord, tWord);
            if (dist < bestDist) {
              bestDist = dist;
            }
          }

          const maxAllowed = sWord.length <= 3 ? 1 : 2;
          if (bestDist <= maxAllowed) {
            totalScore += (sWord.length - bestDist);
          } else {
            matchedAll = false;
            break;
          }
        }

        return { product: p, matchedAll, score: totalScore };
      });

      const fuzzyMatches = matchedWithScores
        .filter((item) => item.matchedAll)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.product);

      if (fuzzyMatches.length > 0) {
        return fuzzyMatches.slice(0, 5);
      }
    }
  }

  return exactProducts;
}
