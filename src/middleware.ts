import { NextRequest, NextResponse } from "next/server";

function isPublicPath(pathname: string) {
  if (pathname === "/login" || pathname === "/api/login") {
    return true;
  }
  if (pathname === "/api/user/import-recipe") {
    return true;
  }
  if (pathname === "/api/import-instagram") {
    return true;
  }
  // Allow webhook endpoints (they have their own auth)
  if (pathname.startsWith("/api/webhooks/")) {
    return true;
  }
  if (pathname.startsWith("/_next/")) {
    return true;
  }
  return pathname === "/favicon.ico";
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    return NextResponse.json({ error: "ADMIN_USER or ADMIN_PASS not set" }, { status: 500 });
  }

  const expected = btoa(`${user}:${pass}`);
  const cookie = request.cookies.get("admin_auth")?.value;
  if (cookie === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/:path*",
};
