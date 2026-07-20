import { NextResponse } from "next/server";
import { getSocialMonitorSettings, runSocialMonitorScan, verifyCronAuth } from "@/lib/aiSocialMonitor";

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getSocialMonitorSettings();
    if (settings.next_scan_at && new Date(settings.next_scan_at).getTime() > Date.now()) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Next scan interval has not elapsed",
        next_scan_at: settings.next_scan_at,
      });
    }

    const result = await runSocialMonitorScan({ manual: false });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
