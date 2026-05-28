import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url parameter required" }, { status: 400 });
  }

  if (!url.includes("docs.google.com") && !url.includes("googleapis.com")) {
    return NextResponse.json({ error: "Only Google Sheets URLs are allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(url, { headers: { Accept: "text/csv" } });
    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed: ${res.status} ${res.statusText}` }, { status: 400 });
    }
    const text = await res.text();
    return new NextResponse(text, {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch the URL" }, { status: 500 });
  }
}
