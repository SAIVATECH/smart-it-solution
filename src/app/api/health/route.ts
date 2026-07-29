import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Redis from "ioredis";

export async function GET() {
  const healthStatus: Record<string, any> = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: "unknown",
      redis: "unknown",
    },
  };

  let hasError = false;

  // 1. Check PostgreSQL Database Connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    healthStatus.services.database = "connected";
  } catch (error: any) {
    healthStatus.services.database = `error: ${error.message}`;
    hasError = true;
  }

  // 2. Check Redis Connection
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 1000 });
    const ping = await redis.ping();
    
    if (ping === "PONG") {
      healthStatus.services.redis = "connected";
    } else {
      healthStatus.services.redis = `error: unexpected ping response ${ping}`;
      hasError = true;
    }
    await redis.quit();
  } catch (error: any) {
    healthStatus.services.redis = `error: ${error.message}`;
    hasError = true;
  }

  if (hasError) {
    healthStatus.status = "degraded";
    return NextResponse.json(healthStatus, { status: 500 });
  }

  return NextResponse.json(healthStatus, { status: 200 });
}
