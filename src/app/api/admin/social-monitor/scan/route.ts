import { NextResponse } from "next/server";
import { runSocialMonitorScan } from "@/lib/aiSocialMonitor";

export async function POST() {
  try {
    const result = await runSocialMonitorScan({ manual: true });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
