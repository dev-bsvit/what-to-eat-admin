import { NextResponse } from "next/server";
import { generateEmbedding } from "@/lib/aiSocialMonitor";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const SELECT_COLUMNS = `
  id,source,external_id,author_name,author_handle,author_url,country,language,posted_at,
  text,text_translation,original_url,ai_score,ai_summary,ai_reason,ai_problem,ai_goal,
  ai_emotion,ai_conversion_probability,ai_should_reply,ai_reply,detected_competitors,
  ai_analysis,reply_status,feedback,status,created_at,updated_at
`;

function applyPostFilters(rows: any[], params: URLSearchParams) {
  const source = params.get("source");
  const language = params.get("language");
  const country = params.get("country");
  const feedback = params.get("feedback");
  const replyStatus = params.get("replyStatus");
  const minScore = Number(params.get("minScore") || 0);
  const maxScore = Number(params.get("maxScore") || 100);
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const hasReply = params.get("hasReply");

  return rows.filter((row) => {
    if (source && row.source !== source) return false;
    if (language && row.language !== language) return false;
    if (country && row.country !== country) return false;
    if (feedback && row.feedback !== feedback) return false;
    if (replyStatus && row.reply_status !== replyStatus) return false;
    if (Number(row.ai_score || 0) < minScore || Number(row.ai_score || 0) > maxScore) return false;
    if (hasReply === "true" && !row.ai_reply) return false;
    if (hasReply === "false" && row.ai_reply) return false;
    if (dateFrom && new Date(row.posted_at || row.created_at).getTime() < new Date(dateFrom).getTime()) return false;
    if (dateTo && new Date(row.posted_at || row.created_at).getTime() > new Date(dateTo).getTime()) return false;
    return true;
  });
}

function applyQueryFilters(query: any, params: URLSearchParams) {
  const source = params.get("source");
  const language = params.get("language");
  const country = params.get("country");
  const feedback = params.get("feedback");
  const replyStatus = params.get("replyStatus");
  const minScore = params.get("minScore");
  const maxScore = params.get("maxScore");
  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const hasReply = params.get("hasReply");

  if (source) query = query.eq("source", source);
  if (language) query = query.eq("language", language);
  if (country) query = query.eq("country", country);
  if (feedback) query = query.eq("feedback", feedback);
  if (replyStatus) query = query.eq("reply_status", replyStatus);
  if (minScore) query = query.gte("ai_score", Number(minScore));
  if (maxScore) query = query.lte("ai_score", Number(maxScore));
  if (dateFrom) query = query.gte("posted_at", dateFrom);
  if (dateTo) query = query.lte("posted_at", dateTo);
  if (hasReply === "true") query = query.neq("ai_reply", "");
  if (hasReply === "false") query = query.eq("ai_reply", "");

  return query;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") || 30)));
    const search = searchParams.get("q")?.trim() || "";

    if (search) {
      const embedding = await generateEmbedding(search);
      if (embedding) {
        const { data, error } = await supabaseAdmin.rpc("match_ai_social_monitor_posts", {
          query_embedding: embedding,
          match_count: 120,
        });

        if (!error && data) {
          const filtered = applyPostFilters(data as any[], searchParams);
          const from = (page - 1) * limit;
          return NextResponse.json({
            data: filtered.slice(from, from + limit),
            count: filtered.length,
            semantic: true,
          });
        }
      }
    }

    let query = supabaseAdmin
      .from("ai_social_monitor_posts")
      .select(SELECT_COLUMNS, { count: "exact" });

    query = applyQueryFilters(query, searchParams);

    if (search) {
      const term = `%${search.replace(/[%,_()]/g, " ").trim()}%`;
      query = query.or(
        `text.ilike.${term},text_translation.ilike.${term},ai_problem.ilike.${term},ai_goal.ilike.${term},ai_summary.ilike.${term},author_name.ilike.${term},author_handle.ilike.${term}`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await query
      .order("ai_score", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return NextResponse.json({
      data: data ?? [],
      count: count ?? 0,
      semantic: false,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
