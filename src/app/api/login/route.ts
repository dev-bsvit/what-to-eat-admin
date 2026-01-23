import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  if (!user || !pass) {
    return NextResponse.json({ error: "Admin credentials not configured" }, { status: 500 });
  }

  if (username !== user || password !== pass) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = btoa(`${user}:${pass}`);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return response;
}
