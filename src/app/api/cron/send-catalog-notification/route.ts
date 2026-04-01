/**
 * GET /api/cron/send-catalog-notification
 *
 * Called daily by pg_cron via pg_net.
 * Finds new cuisines added in the last 25h that haven't been notified yet,
 * then sends an APNs push to all users with catalog notifications enabled.
 *
 * Auth: Bearer CRON_SECRET header (same pattern as normalize-ingredients)
 * Also accepts POST for manual triggering from the admin panel UI.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPush } from "@/lib/apns";

// ─── Auth ──────────────────────────────────────────────────────────────────

function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "development") return true;
  if (!cronSecret) return false;

  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Handler ───────────────────────────────────────────────────────────────

async function handle(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Find new cuisines added in the last 25h window
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();

    const { data: alreadyLogged } = await supabaseAdmin
      .from("notification_log")
      .select("reference_id")
      .eq("type", "catalog");

    const loggedIds = new Set<string>(
      (alreadyLogged ?? []).map((r: { reference_id: string }) => r.reference_id)
    );

    const { data: newCuisines, error: cuisineErr } = await supabaseAdmin
      .from("cuisines")
      .select("id, name")
      .gte("created_at", since);

    if (cuisineErr) throw cuisineErr;

    const unnotified = (newCuisines ?? []).filter(
      (c: { id: string }) => !loggedIds.has(c.id)
    );

    if (unnotified.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No new unnotified cuisines" });
    }

    // 2. Get push tokens for users with catalog notifications enabled
    const { data: tokenRows, error: tokenErr } = await supabaseAdmin
      .from("push_tokens")
      .select(`
        token,
        user_id,
        notification_preferences!left ( catalog_enabled )
      `)
      .eq("platform", "ios");

    if (tokenErr) throw tokenErr;
    if (!tokenRows?.length) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No push tokens registered" });
    }

    // Keep tokens where catalog_enabled is true or preference row is missing (default = true)
    const eligible = tokenRows
      .filter((row: { notification_preferences: { catalog_enabled: boolean } | null }) => {
        const pref = row.notification_preferences;
        return pref === null || pref.catalog_enabled !== false;
      })
      .map((row: { token: string }) => row.token);

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "All users have catalog notifications disabled" });
    }

    // 3. Build notification content
    const firstName = (unnotified[0] as { name: string }).name;
    const title = "🍽️ Новый каталог";
    const body =
      unnotified.length === 1
        ? `Добавлен каталог «${firstName}» — загляни!`
        : `Добавлено ${unnotified.length} новых каталога — посмотри что нового`;

    // 4. Send pushes
    const { sent, invalidTokens } = await sendPush(eligible, title, body, { type: "catalog" });

    // 5. Remove stale tokens
    if (invalidTokens.length > 0) {
      await supabaseAdmin.from("push_tokens").delete().in("token", invalidTokens);
      console.log(`Removed ${invalidTokens.length} stale tokens`);
    }

    // 6. Log each notified cuisine to prevent future duplicates
    const logEntries = unnotified.map((c: { id: string }) => ({
      type: "catalog",
      reference_id: c.id,
      sent_count: sent,
    }));

    await supabaseAdmin.from("notification_log").upsert(logEntries, {
      onConflict: "type,reference_id",
    });

    console.log(`✅ Catalog notification sent to ${sent}/${eligible.length} devices`);
    return NextResponse.json({ ok: true, sent, cuisines: unnotified.length });

  } catch (err) {
    console.error("send-catalog-notification error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
