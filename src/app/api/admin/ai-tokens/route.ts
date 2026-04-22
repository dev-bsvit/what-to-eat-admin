import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") ?? "30", 10);

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Total tokens per user with email
  const { data: perUser, error: perUserError } = await adminClient
    .from("ai_token_usage")
    .select("user_id, total_tokens, prompt_tokens, completion_tokens, endpoint, created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (perUserError) {
    return NextResponse.json({ error: perUserError.message }, { status: 500 });
  }

  // Get emails for all user_ids
  const userIds = [...new Set((perUser ?? []).map((r) => r.user_id))];
  const emailMap: Record<string, string> = {};

  if (userIds.length > 0) {
    const { data: users } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    for (const u of users?.users ?? []) {
      if (userIds.includes(u.id)) {
        emailMap[u.id] = u.email ?? u.id;
      }
    }
  }

  // Aggregate per user
  const userStats: Record<string, {
    email: string;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    requests: number;
    by_endpoint: Record<string, { requests: number; total_tokens: number }>;
  }> = {};

  for (const row of perUser ?? []) {
    if (!userStats[row.user_id]) {
      userStats[row.user_id] = {
        email: emailMap[row.user_id] ?? row.user_id,
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        requests: 0,
        by_endpoint: {},
      };
    }
    const s = userStats[row.user_id];
    s.total_tokens += row.total_tokens;
    s.prompt_tokens += row.prompt_tokens;
    s.completion_tokens += row.completion_tokens;
    s.requests += 1;
    if (!s.by_endpoint[row.endpoint]) {
      s.by_endpoint[row.endpoint] = { requests: 0, total_tokens: 0 };
    }
    s.by_endpoint[row.endpoint].requests += 1;
    s.by_endpoint[row.endpoint].total_tokens += row.total_tokens;
  }

  const sorted = Object.entries(userStats)
    .map(([userId, stats]) => ({ userId, ...stats }))
    .sort((a, b) => b.total_tokens - a.total_tokens);

  const grandTotal = sorted.reduce((sum, u) => sum + u.total_tokens, 0);

  return NextResponse.json({ users: sorted, grandTotal, days });
}
