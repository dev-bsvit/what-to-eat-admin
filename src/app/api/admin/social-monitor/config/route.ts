import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getSocialMonitorSettings,
  getSocialMonitorSources,
  saveSocialMonitorSettings,
} from "@/lib/aiSocialMonitor";

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status }
  );
}

export async function GET() {
  try {
    const [settings, sources, runsResult] = await Promise.all([
      getSocialMonitorSettings(),
      getSocialMonitorSources(),
      supabaseAdmin
        .from("ai_social_monitor_runs")
        .select("id,status,manual,started_at,finished_at,sources_checked,posts_found,posts_analyzed,error")
        .order("started_at", { ascending: false })
        .limit(8),
    ]);

    return NextResponse.json({
      settings,
      sources,
      runs: runsResult.data ?? [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const settings = await saveSocialMonitorSettings(body);

    await supabaseAdmin
      .from("ai_social_monitor_sources")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .neq("id", "__none__");

    if (settings.enabled_sources.length > 0) {
      await supabaseAdmin
        .from("ai_social_monitor_sources")
        .update({ enabled: true, updated_at: new Date().toISOString() })
        .in("id", settings.enabled_sources);
    }

    const sources = await getSocialMonitorSources();
    return NextResponse.json({ settings, sources });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
