import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET - List moderation tasks
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";
    const taskType = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabaseAdmin
      .from("moderation_tasks")
      .select("*", { count: "exact" })
      .eq("status", status)
      .order("confidence", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (taskType) {
      query = query.eq("task_type", taskType);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Enrich with product info
    const enriched = await Promise.all(
      (data || []).map(async (task) => {
        let productInfo = null;
        if (task.product_id) {
          const { data: product } = await supabaseAdmin
            .from("product_dictionary")
            .select("id, canonical_name, category, icon")
            .eq("id", task.product_id)
            .single();
          productInfo = product;
        }

        // For link_suggestion, get suggested product info
        let suggestedProductInfo = null;
        if (task.task_type === "link_suggestion" && task.suggested_action?.suggestedProductId) {
          const { data: suggested } = await supabaseAdmin
            .from("product_dictionary")
            .select("id, canonical_name, category, icon")
            .eq("id", task.suggested_action.suggestedProductId)
            .single();
          suggestedProductInfo = suggested;
        }

        // For merge_suggestion, get matched product info
        let matchedProductInfo = null;
        if (task.task_type === "merge_suggestion" && task.suggested_action?.matchedWithId) {
          const { data: matched } = await supabaseAdmin
            .from("product_dictionary")
            .select("id, canonical_name, category, icon")
            .eq("id", task.suggested_action.matchedWithId)
            .single();
          matchedProductInfo = matched;
        }

        // Get recipe source for both products in merge_suggestion
        let productRecipeSource = null;
        let matchedRecipeSource = null;
        if (task.task_type === "merge_suggestion") {
          // Find recipe for the first product
          if (productInfo?.canonical_name) {
            const { data: recipes } = await supabaseAdmin
              .from("recipes")
              .select("id, title, source_url")
              .ilike("ingredients", `%${productInfo.canonical_name}%`)
              .limit(1);
            if (recipes && recipes.length > 0) {
              productRecipeSource = {
                id: recipes[0].id,
                title: recipes[0].title,
                sourceUrl: recipes[0].source_url,
              };
            }
          }
          // Find recipe for the matched product
          if (matchedProductInfo?.canonical_name) {
            const { data: recipes } = await supabaseAdmin
              .from("recipes")
              .select("id, title, source_url")
              .ilike("ingredients", `%${matchedProductInfo.canonical_name}%`)
              .limit(1);
            if (recipes && recipes.length > 0) {
              matchedRecipeSource = {
                id: recipes[0].id,
                title: recipes[0].title,
                sourceUrl: recipes[0].source_url,
              };
            }
          }
        }

        return {
          ...task,
          productInfo,
          suggestedProductInfo,
          matchedProductInfo,
          productRecipeSource,
          matchedRecipeSource,
        };
      })
    );

    return NextResponse.json({
      tasks: enriched,
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// PATCH - Update moderation task status
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { taskId, action, notes } = body;

    if (!taskId || !action) {
      return NextResponse.json(
        { error: "Missing taskId or action" },
        { status: 400 }
      );
    }

    if (!["approve", "reject", "skip"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be: approve, reject, or skip" },
        { status: 400 }
      );
    }

    // Get the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from("moderation_tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      skip: "skipped",
    };

    // Update task status
    const { error: updateError } = await supabaseAdmin
      .from("moderation_tasks")
      .update({
        status: statusMap[action],
        reviewed_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq("id", taskId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to update task: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Handle specific actions based on task type
    if (action === "approve") {
      if (task.task_type === "link_suggestion") {
        // Auto-link the ingredient
        await handleLinkSuggestionApproval(task);
      } else if (task.task_type === "new_product") {
        // Approve the product
        await handleNewProductApproval(task);
      }
      // merge_suggestion is handled via separate merge API
    }

    return NextResponse.json({ success: true, status: statusMap[action] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function handleLinkSuggestionApproval(task: any): Promise<void> {
  const { ingredientName, suggestedProductId, suggestedProductName, recipeIds } =
    task.suggested_action || {};

  if (!ingredientName || !suggestedProductId) return;

  // Link ingredient in recipes
  for (const recipeId of recipeIds || []) {
    const { data: recipe } = await supabaseAdmin
      .from("recipes")
      .select("ingredients")
      .eq("id", recipeId)
      .single();

    if (!recipe?.ingredients) continue;

    let parsed: any[] = [];
    try {
      parsed = typeof recipe.ingredients === "string"
        ? JSON.parse(recipe.ingredients)
        : recipe.ingredients;
    } catch {
      continue;
    }

    const targetKey = ingredientName.toLowerCase().trim();
    let changed = false;

    const updated = parsed.map((ing) => {
      const name = typeof ing === "string"
        ? ing.trim()
        : String(ing?.name || ing?.productName || "").trim();

      if (name.toLowerCase() !== targetKey) return ing;

      changed = true;
      if (typeof ing === "string") {
        return {
          id: suggestedProductId,
          name: suggestedProductName,
          quantity: 0,
          unit: "g",
        };
      }
      return { ...ing, id: suggestedProductId, name: suggestedProductName };
    });

    if (changed) {
      await supabaseAdmin
        .from("recipes")
        .update({ ingredients: JSON.stringify(updated) })
        .eq("id", recipeId);
    }
  }

  // Add synonym
  const { data: product } = await supabaseAdmin
    .from("product_dictionary")
    .select("synonyms")
    .eq("id", suggestedProductId)
    .single();

  if (product) {
    const synonyms = Array.isArray(product.synonyms) ? product.synonyms : [];
    if (!synonyms.includes(ingredientName)) {
      await supabaseAdmin
        .from("product_dictionary")
        .update({ synonyms: [...synonyms, ingredientName] })
        .eq("id", suggestedProductId);
    }
  }
}

async function handleNewProductApproval(task: any): Promise<void> {
  if (!task.product_id) return;

  await supabaseAdmin
    .from("product_dictionary")
    .update({
      moderation_status: "manually_approved",
      needs_moderation: false,
    })
    .eq("id", task.product_id);
}
