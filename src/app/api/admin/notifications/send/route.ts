/**
 * POST /api/admin/notifications/send
 *
 * Manual broadcast from the admin panel.
 * Supports type "promo" and "system".
 *
 * Body:
 *   { title: string, body: string, type: "promo" | "system" }
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
    const prefColumn = type === "promo" ? "promo_enabled" : "system_enabled";

    // 1. Get all iOS push tokens with user_ids
    const { data: tokenRows, error: tokenErr } = await supabaseAdmin
      .from("push_tokens")
      .select("token, user_id")
      .eq("platform", "ios");

    if (tokenErr) throw tokenErr;
    if (!tokenRows?.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No push tokens registered" });
    }

    // 2. Get notification preferences for those users
    const userIds = tokenRows.map((r) => r.user_id).filter(Boolean);
    const { data: prefs } = await supabaseAdmin
      .from("notification_preferences")
      .select(`user_id, ${prefColumn}`)
      .in("user_id", userIds);

    const prefMap = new Map<string, boolean>();
    for (const pref of (prefs ?? []) as Array<Record<string, unknown>>) {
      prefMap.set(pref.user_id as string, pref[prefColumn] !== false);
    }

    // 3. Filter eligible tokens (default = enabled if no preference row)
    const eligible = tokenRows
      .filter((row) => {
        if (!row.user_id) return true;
        const enabled = prefMap.get(row.user_id);
        return enabled === undefined ? true : enabled;
      })
      .map((row) => row.token as string);

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "All users have this notification type disabled" });
    }

    // 4. Send pushes
    const { sent, invalidTokens } = await sendPush(eligible, title.trim(), body.trim(), { type });

    // 5. Remove stale tokens
    if (invalidTokens.length > 0) {
      await supabaseAdmin.from("push_tokens").delete().in("token", invalidTokens);
    }

    // 6. Log the broadcast
    await supabaseAdmin.from("notification_log").insert({
      type,
      reference_id: null,
      sent_count: sent,
    });

    return NextResponse.json({ ok: true, sent, total: eligible.length });

  } catch (err) {
    console.error("admin/notifications/send error:", err);
    const errMsg = err instanceof Error
      ? err.message
      : (typeof err === "object" ? JSON.stringify(err) : String(err));
    return NextResponse.json(
      { ok: false, error: errMsg },
      { status: 500 }
    );
  }
}
