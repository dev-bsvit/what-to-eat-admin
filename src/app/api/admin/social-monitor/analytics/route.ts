import { NextResponse } from "next/server";
import { getSocialMonitorSettings } from "@/lib/aiSocialMonitor";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type CountItem = {
  key: string;
  count: number;
};

function increment(map: Map<string, number>, key?: string | null) {
  const normalized = key?.trim() || "Unknown";
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function topItems(map: Map<string, number>, limit = 8): CountItem[] {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export async function GET() {
  try {
    const settings = await getSocialMonitorSettings();
    const [postsResult, runsResult, notificationsResult] = await Promise.all([
      supabaseAdmin
        .from("ai_social_monitor_posts")
        .select("source,language,country,ai_score,ai_problem,detected_competitors,created_at,feedback,reply_status")
        .limit(10000),
      supabaseAdmin
        .from("ai_social_monitor_runs")
        .select("id,status,manual,started_at,finished_at,sources_checked,posts_found,posts_analyzed,error")
        .order("started_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("ai_social_monitor_notifications")
        .select("id", { count: "exact", head: true })
        .is("seen_at", null),
    ]);

    if (postsResult.error) throw postsResult.error;
    if (runsResult.error) throw runsResult.error;

    const posts = postsResult.data ?? [];
    const sourceCounts = new Map<string, number>();
    const languageCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const problemCounts = new Map<string, number>();
    const competitorCounts = new Map<string, number>();

    let prospects = 0;
    let highIntent = 0;
    let useful = 0;
    let notUseful = 0;
    let withReply = 0;

    const since24h = Date.now() - 24 * 60 * 60 * 1000;
    let found24h = 0;

    for (const post of posts as Array<Record<string, any>>) {
      increment(sourceCounts, post.source);
      increment(languageCounts, post.language);
      increment(countryCounts, post.country);
      increment(problemCounts, post.ai_problem);

      for (const competitor of post.detected_competitors || []) {
        increment(competitorCounts, String(competitor));
      }

      if (Number(post.ai_score || 0) >= 60) prospects += 1;
      if (Number(post.ai_score || 0) >= settings.high_score_threshold) highIntent += 1;
      if (post.feedback === "useful") useful += 1;
      if (post.feedback === "not_useful") notUseful += 1;
      if (post.reply_status && post.reply_status !== "none") withReply += 1;
      if (new Date(post.created_at).getTime() >= since24h) found24h += 1;
    }

    return NextResponse.json({
      totals: {
        posts: posts.length,
        prospects,
        high_intent: highIntent,
        found_24h: found24h,
        useful,
        not_useful: notUseful,
        with_reply: withReply,
        unseen_notifications: notificationsResult.count ?? 0,
      },
      top_sources: topItems(sourceCounts),
      top_languages: topItems(languageCounts),
      top_countries: topItems(countryCounts),
      top_problems: topItems(problemCounts),
      top_competitors: topItems(competitorCounts),
      runs: runsResult.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
