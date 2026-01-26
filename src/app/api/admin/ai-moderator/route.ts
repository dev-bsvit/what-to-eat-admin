import { NextResponse } from "next/server";
import {
  processIngredient,
  processIngredientsBatch,
  fillProductWithAI,
  getModeratorStats,
  resetModeratorStats,
} from "@/lib/aiModerator";
import {
  refreshProductCache,
  getCacheStats,
  clearExpiredCache,
} from "@/lib/aiModeratorCache";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Helper to find recipe containing a product as ingredient
async function findRecipeByIngredient(productName: string): Promise<{
  id: string;
  title: string;
  sourceUrl?: string;
} | null> {
  const { data: recipes } = await supabaseAdmin
    .from("recipes")
    .select("id, title, source_url, ingredients")
    .limit(100);

  if (!recipes || recipes.length === 0) return null;

  const normalizedSearch = productName.toLowerCase().trim();

  for (const recipe of recipes) {
    if (!recipe.ingredients) continue;

    try {
      const ingredients = typeof recipe.ingredients === "string"
        ? JSON.parse(recipe.ingredients)
        : recipe.ingredients;

      if (!Array.isArray(ingredients)) continue;

      for (const ing of ingredients) {
        const name = typeof ing === "string"
          ? ing
          : (ing?.name || ing?.productName || ing?.title || "");

        if (name && name.toLowerCase().trim() === normalizedSearch) {
          return {
            id: recipe.id,
            title: recipe.title || "Без названия",
            sourceUrl: recipe.source_url || undefined,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// GET - Get moderator stats and cache info
export async function GET() {
  try {
    await refreshProductCache();

    const stats = getModeratorStats();
    const cacheStats = getCacheStats();

    return NextResponse.json({
      stats,
      cache: cacheStats,
      efficiency: stats.totalProcessed > 0
        ? Math.round(((stats.autoLinked + stats.cacheHits) / stats.totalProcessed) * 100)
        : 100,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// POST - Process ingredients
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ingredients, productId, productName, locale } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing action parameter" },
        { status: 400 }
      );
    }

    switch (action) {
      case "process_single": {
        if (!ingredients || typeof ingredients !== "string") {
          return NextResponse.json(
            { error: "Missing ingredient name" },
            { status: 400 }
          );
        }
        const result = await processIngredient(ingredients, locale || "ru");
        return NextResponse.json({ result, stats: getModeratorStats() });
      }

      case "process_batch": {
        if (!ingredients || !Array.isArray(ingredients)) {
          return NextResponse.json(
            { error: "Missing ingredients array" },
            { status: 400 }
          );
        }

        // Limit batch size
        const limited = ingredients.slice(0, 50);
        const results = await processIngredientsBatch(limited, locale || "ru");

        const summary = {
          total: results.length,
          autoLinked: results.filter((r) => r.action === "auto_linked").length,
          suggested: results.filter((r) => r.action === "suggested").length,
          skipped: results.filter((r) => r.action === "skipped").length,
          errors: results.filter((r) => r.action === "error").length,
          aiUsed: results.filter((r) => r.aiUsed).length,
        };

        return NextResponse.json({
          results,
          summary,
          stats: getModeratorStats(),
        });
      }

      case "fill_product": {
        if (!productId || !productName) {
          return NextResponse.json(
            { error: "Missing productId or productName" },
            { status: 400 }
          );
        }
        const fillResult = await fillProductWithAI(productId, productName);
        return NextResponse.json({
          result: fillResult,
          stats: getModeratorStats(),
        });
      }

      case "refresh_cache": {
        await refreshProductCache();
        const cleared = await clearExpiredCache();
        return NextResponse.json({
          success: true,
          cache: getCacheStats(),
          expiredCleared: cleared,
        });
      }

      case "reset_stats": {
        resetModeratorStats();
        return NextResponse.json({
          success: true,
          stats: getModeratorStats(),
        });
      }

      case "get_history": {
        // Get recent moderation tasks created by webhook (autoCreated)
        const limit = body.limit || 50;
        const { data: tasks, error } = await supabaseAdmin
          .from("moderation_tasks")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Enrich with product info
        const enriched = await Promise.all(
          (tasks || []).map(async (task) => {
            let productInfo = null;
            if (task.product_id) {
              const { data: product } = await supabaseAdmin
                .from("product_dictionary")
                .select("id, canonical_name, category, icon")
                .eq("id", task.product_id)
                .single();
              productInfo = product;
            }

            // Get recipe source if available
            let recipeSource = null;
            if (productInfo?.canonical_name) {
              recipeSource = await findRecipeByIngredient(productInfo.canonical_name);
            }

            return {
              ...task,
              productInfo,
              recipeSource,
            };
          })
        );

        return NextResponse.json({ history: enriched });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
