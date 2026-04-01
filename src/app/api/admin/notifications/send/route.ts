/**
 * POST /api/admin/notifications/send
 *
 * Manual broadcast from the admin panel.
 * Supports type "promo" and "system".
 *
 * Body:
 *   { title: string, body: string, type: "promo" | "system" }
 *
 * No cron auth — only accessible from within the admin panel (same origin).
 * Add session-based auth if the admin panel is ever exposed publicly.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush } from "@/lib/apns";

type BroadcastType = "promo" | "system";

interface SendBody {
  title: string;
  body: string;
  type: BroadcastType;
}

export async function POST(request: Request) {
  let payload: SendBody;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, body, type } = payload;

  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "title and body are required" }, { status: 400 });
  }

  if (type !== "promo" && type !== "system") {
    return NextResponse.json({ error: "type must be 'promo' or 'system'" }, { status: 400 });
  }

  try {
    // 1. Get eligible push tokens (filter by notification_preferences)
    const prefColumn = type === "promo" ? "promo_enabled" : "system_enabled";

    const { data: tokenRows, error: tokenErr } = await supabaseAdmin
      .from("push_tokens")
      .select(`
        token,
        notification_preferences!left ( ${prefColumn} )
      `)
      .eq("platform", "ios");

    if (tokenErr) throw tokenErr;
    if (!tokenRows?.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No push tokens registered" });
    }

    const eligible = (tokenRows as Array<Record<string, unknown>>)
      .filter((row) => {
        const raw = row.notification_preferences;
        const pref = (Array.isArray(raw) ? raw[0] ?? null : raw) as Record<string, boolean> | null;
        return pref === null || pref[prefColumn] !== false;
      })
      .map((row) => row.token as string);

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "All users have this notification type disabled" });
    }

    // 2. Send pushes
    const { sent, invalidTokens } = await sendPush(eligible, title.trim(), body.trim(), { type });

    // 3. Remove stale tokens
    if (invalidTokens.length > 0) {
      await supabaseAdmin.from("push_tokens").delete().in("token", invalidTokens);
    }

    // 4. Log the broadcast
    await supabaseAdmin.from("notification_log").insert({
      type,
      reference_id: null,
      sent_count: sent,
    });

    return NextResponse.json({ ok: true, sent, total: eligible.length });

  } catch (err) {
    console.error("admin/notifications/send error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
