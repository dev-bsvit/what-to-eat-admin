import { NextRequest, NextResponse } from "next/server";

const REALM = "What to Eat Admin";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
    },
  });
}

export function middleware(request: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    return unauthorized();
  }

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Basic ")) {
    return unauthorized();
  }

  const base64 = authHeader.slice("Basic ".length).trim();
  let decoded = "";
  try {
    decoded = atob(base64);
  } catch {
    return unauthorized();
  }

  const [incomingUser, incomingPass] = decoded.split(":");
  if (incomingUser !== user || incomingPass !== pass) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
