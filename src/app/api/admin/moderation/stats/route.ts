import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    // Get stats - handle missing tables/columns gracefully
    let pendingTasks = 0;
    let pendingProducts = 0;
    let totalProducts = 0;
    let autoApprovedToday = 0;
    const tasksByType: Record<string, number> = {
      link_suggestion: 0,
      merge_suggestion: 0,
      new_product: 0,
    };

    // Total products (always exists)
    const { count: totalCount } = await supabaseAdmin
      .from("product_dictionary")
      .select("*", { count: "exact", head: true });
    totalProducts = totalCount || 0;

    // Try to get moderation_tasks stats (may not exist)
    try {
      const { count: tasksCount } = await supabaseAdmin
        .from("moderation_tasks")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      pendingTasks = tasksCount || 0;

      const { data: taskTypes } = await supabaseAdmin
        .from("moderation_tasks")
        .select("task_type")
        .eq("status", "pending");

      (taskTypes || []).forEach((task: { task_type: string }) => {
        if (task.task_type && tasksByType[task.task_type] !== undefined) {
          tasksByType[task.task_type]++;
        }
      });
    } catch {
      // Table might not exist yet
    }

    // Try to get needs_moderation count (column may not exist)
    try {
      const { count: pendingCount } = await supabaseAdmin
        .from("product_dictionary")
        .select("*", { count: "exact", head: true })
        .eq("needs_moderation", true);
      pendingProducts = pendingCount || 0;
    } catch {
      // Column might not exist
    }

    // Try to get auto_approved today (column may not exist)
    try {
      const { count: autoCount } = await supabaseAdmin
        .from("product_dictionary")
        .select("*", { count: "exact", head: true })
        .eq("moderation_status", "auto_approved")
        .gte("created_at", new Date().toISOString().split("T")[0]);
      autoApprovedToday = autoCount || 0;
    } catch {
      // Column might not exist
    }

    return NextResponse.json({
      stats: {
        pendingTasks,
        pendingProducts,
        totalProducts,
        autoApprovedToday,
        tasksByType,
        reviewedLastWeek: 0,
        approvedLastWeek: 0,
        approvalRate: 0,
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
