import { NextResponse } from "next/server";
import { getSocialMonitorTrends } from "@/lib/aiSocialMonitor";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const onlyTrending = searchParams.get("trending") === "true";
    const limit = Number(searchParams.get("limit") || 100);

    const data = await getSocialMonitorTrends({ onlyTrending, limit });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
