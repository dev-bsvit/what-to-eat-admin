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
