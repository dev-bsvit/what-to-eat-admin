import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const feedback = body.feedback === "useful" || body.feedback === "not_useful" ? body.feedback : null;
    const replyStatus = ["none", "copied", "replied", "ignored"].includes(body.reply_status)
      ? body.reply_status
      : undefined;
    const status = ["new", "reviewed", "archived"].includes(body.status) ? body.status : undefined;

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (feedback) update.feedback = feedback;
    if (replyStatus) update.reply_status = replyStatus;
    if (status) update.status = status;

    const { data, error } = await supabaseAdmin
      .from("ai_social_monitor_posts")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ post: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
