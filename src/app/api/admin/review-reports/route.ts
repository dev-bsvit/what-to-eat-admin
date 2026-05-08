import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ReviewType = "recipe_review" | "cuisine_review";

type ReviewRecord = {
  id: string;
  user_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  moderation_status?: string;
  is_hidden?: boolean;
  reported_count?: number;
  recipe_id?: string;
  cuisine_id?: string;
};

async function getProfile(userId?: string | null) {
  if (!userId) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

async function getRecipeTitle(recipeId?: string | null) {
  if (!recipeId) return null;
  const { data } = await supabaseAdmin
    .from("recipes")
    .select("id, title")
    .eq("id", recipeId)
    .maybeSingle();
  return data ?? null;
}

async function getCuisineTitle(cuisineId?: string | null) {
  if (!cuisineId) return null;
  const { data } = await supabaseAdmin
    .from("cuisines")
    .select("id, name")
    .eq("id", cuisineId)
    .maybeSingle();
  return data ?? null;
}

async function getReview(type: ReviewType, reviewId: string): Promise<ReviewRecord | null> {
  const table = type === "recipe_review" ? "recipe_reviews" : "cuisine_reviews";
  const { data } = await supabaseAdmin
    .from(table)
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();
  return data ?? null;
}

async function enrichReview(type: ReviewType, review: ReviewRecord) {
  const [author, source] = await Promise.all([
    getProfile(review.user_id),
    type === "recipe_review"
      ? getRecipeTitle(review.recipe_id)
      : getCuisineTitle(review.cuisine_id),
  ]);

  return {
    ...review,
    target_type: type,
    author,
    source,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "reports";
    const status = searchParams.get("status") || "pending";
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 300);

    if (mode === "reviews") {
      const [recipeRes, cuisineRes] = await Promise.all([
        supabaseAdmin
          .from("recipe_reviews")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit),
        supabaseAdmin
          .from("cuisine_reviews")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);

      if (recipeRes.error) {
        return NextResponse.json({ error: recipeRes.error.message }, { status: 400 });
      }
      if (cuisineRes.error) {
        return NextResponse.json({ error: cuisineRes.error.message }, { status: 400 });
      }

      const reviews = await Promise.all([
        ...((recipeRes.data || []) as ReviewRecord[]).map((review) => enrichReview("recipe_review", review)),
        ...((cuisineRes.data || []) as ReviewRecord[]).map((review) => enrichReview("cuisine_review", review)),
      ]);

      reviews.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return NextResponse.json({ reviews: reviews.slice(0, limit) });
    }

    let query = supabaseAdmin
      .from("review_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const reports = await Promise.all(
      (data || []).map(async (report) => {
        const reviewId = report.target_type === "recipe_review"
          ? report.recipe_review_id
          : report.cuisine_review_id;
        const review = reviewId ? await getReview(report.target_type, reviewId) : null;
        const [reporter, enrichedReview] = await Promise.all([
          getProfile(report.reported_by),
          review ? enrichReview(report.target_type, review) : Promise.resolve(null),
        ]);

        return {
          ...report,
          reporter,
          review: enrichedReview,
        };
      })
    );

    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { action, reportId, targetType, reviewId, authorId, notes } = body as {
      action?: "hide" | "restore" | "dismiss" | "block_author";
      reportId?: string;
      targetType?: ReviewType;
      reviewId?: string;
      authorId?: string;
      notes?: string;
    };

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    if (action === "block_author") {
      if (!authorId) {
        return NextResponse.json({ error: "Missing authorId" }, { status: 400 });
      }

      const { error } = await supabaseAdmin
        .from("review_user_blocks")
        .upsert({
          user_id: authorId,
          scope: "reviews",
          reason: notes || "Blocked from admin review moderation",
        }, { onConflict: "user_id,scope" });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      if (!targetType || !reviewId) {
        return NextResponse.json({ error: "Missing targetType or reviewId" }, { status: 400 });
      }

      const table = targetType === "recipe_review" ? "recipe_reviews" : "cuisine_reviews";
      const update = action === "hide"
        ? { is_hidden: true, moderation_status: "rejected" }
        : action === "restore"
          ? { is_hidden: false, moderation_status: "approved" }
          : null;

      if (update) {
        const { error } = await supabaseAdmin
          .from(table)
          .update(update)
          .eq("id", reviewId);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 });
        }
      }
    }

    if (reportId) {
      const status = action === "dismiss" ? "dismissed" : "action_taken";
      const { error } = await supabaseAdmin
        .from("review_reports")
        .update({
          status,
          admin_notes: notes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
