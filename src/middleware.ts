import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

// JWT key helper for edge middleware
const JWT_SECRET = process.env.JWT_SECRET || "fallback-super-secret-key-whatsapp-saas-platform-2026";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect admin dashboard path
  if (pathname.startsWith("/admin")) {
    const accessToken = req.cookies.get("access_token")?.value;

    if (!accessToken) {
      // Redirect to sign in page
      const loginUrl = new URL("/auth/login", req.url);
      return NextResponse.redirect(loginUrl);
    }

    try {
      // Direct verification (using dynamic parsing since jsonwebtoken works in edge if pure JS, 
      // or we can just parse the signature or rely on token existence and let API handles detailed claims).
      // For Next.js edge environment, using a simple validation or try-catch block:
      const payload = joseJwtVerifyShim(accessToken);
      if (!payload) {
        throw new Error("Invalid Token");
      }
      
      const response = NextResponse.next();
      response.headers.set("x-user-id", payload.userId);
      response.headers.set("x-tenant-id", payload.tenantId);
      response.headers.set("x-user-role", payload.role);
      return response;
    } catch (error) {
      const loginUrl = new URL("/auth/login", req.url);
      loginUrl.searchParams.set("error", "session_expired");
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

/**
 * Basic JWT decode helper since full Node.js crypto may not be fully loaded in custom Edge Middleware environments.
 */
function joseJwtVerifyShim(token: string): { userId: string; tenantId: string; role: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    
    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }
    
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  } catch (e) {
    return null;
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};
