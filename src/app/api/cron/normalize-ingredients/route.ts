import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  normalize,
  findBestMatch,
  findDuplicateCandidates,
  isUuid,
  type MatchResult,
  type DuplicateCandidate,
} from "@/lib/stringUtils";

type RecipeRow = {
  id: string;
  title: string | null;
  ingredients: unknown;
};

type ProductRow = {
  id: string;
  canonical_name: string;
  synonyms: string[] | null;
};

type IngredientItem = {
  name?: string;
  productName?: string;
  title?: string;
  id?: string | null;
};

interface NormalizationResult {
  timestamp: string;
  duration_ms: number;
  unlinked_found: number;
  auto_linked: number;
  suggested_for_review: number;
  duplicates_found: number;
  errors: string[];
  details: {
    autoLinked: Array<{ ingredient: string; product: string; confidence: number }>;
    suggestedForReview: Array<{ ingredient: string; bestMatch: string; confidence: number }>;
    duplicates: DuplicateCandidate[];
  };
}

// Verify cron secret for security
function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Allow in development without auth
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  // If no secret configured, deny in production
  if (!cronSecret) {
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const errors: string[] = [];

  // Verify authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result: NormalizationResult = {
    timestamp: new Date().toISOString(),
    duration_ms: 0,
    unlinked_found: 0,
    auto_linked: 0,
    suggested_for_review: 0,
    duplicates_found: 0,
    errors: [],
    details: {
      autoLinked: [],
      suggestedForReview: [],
      duplicates: [],
    },
  };

  try {
    // 1. Load all products
    const { data: products, error: productError } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, synonyms");

    if (productError) {
      errors.push(`Failed to load products: ${productError.message}`);
      result.errors = errors;
      result.duration_ms = Date.now() - startTime;
      return NextResponse.json(result, { status: 500 });
    }

    const productList = (products || []) as ProductRow[];

    // Build known names set
    const known = new Set<string>();
    productList.forEach((row) => {
      if (row.canonical_name) {
        known.add(normalize(row.canonical_name));
      }
      (row.synonyms || []).forEach((syn) => {
        if (syn) known.add(normalize(syn));
      });
    });

    // 2. Load all recipes
    const { data: recipes, error: recipeError } = await supabaseAdmin
      .from("recipes")
      .select("id, title, ingredients");

    if (recipeError) {
      errors.push(`Failed to load recipes: ${recipeError.message}`);
      result.errors = errors;
      result.duration_ms = Date.now() - startTime;
      return NextResponse.json(result, { status: 500 });
    }

    // 3. Find unlinked ingredients
    const unlinkedMap = new Map<string, { count: number; recipeIds: string[] }>();

    for (const row of (recipes || []) as RecipeRow[]) {
      const ingredientsRaw = row.ingredients;
      if (!ingredientsRaw) continue;

      let parsed: IngredientItem[] = [];
      try {
        parsed = typeof ingredientsRaw === "string"
          ? JSON.parse(ingredientsRaw)
          : (ingredientsRaw as IngredientItem[]);
      } catch {
        continue;
      }

      if (!Array.isArray(parsed)) continue;

      for (const ing of parsed as (IngredientItem | string)[]) {
        // Skip if already has valid product ID
        if (ing && typeof ing === "object") {
          const idValue = String((ing as IngredientItem).id || "").trim();
          if (idValue && isUuid(idValue)) continue;
        }

        const name =
          typeof ing === "string"
            ? ing.trim()
            : String((ing as IngredientItem)?.name || (ing as IngredientItem)?.productName || (ing as IngredientItem)?.title || "").trim();

        if (!name) continue;

        const key = normalize(name);
        if (known.has(key)) continue;

        const record = unlinkedMap.get(name) || { count: 0, recipeIds: [] };
        record.count += 1;
        if (record.recipeIds.length < 5) {
          record.recipeIds.push(row.id);
        }
        unlinkedMap.set(name, record);
      }
    }

    result.unlinked_found = unlinkedMap.size;

    // 4. Try to auto-link or suggest matches
    for (const [ingredientName, data] of unlinkedMap.entries()) {
      const match = findBestMatch(ingredientName, productList);

      if (!match) continue;

      if (match.confidence >= 0.9) {
        // Auto-link with high confidence
        const linked = await autoLinkIngredient(
          ingredientName,
          match.productId,
          match.productName,
          data.recipeIds
        );

        if (linked) {
          result.auto_linked += 1;
          result.details.autoLinked.push({
            ingredient: ingredientName,
            product: match.productName,
            confidence: match.confidence,
          });

          // Add as synonym if not already
          await addSynonymIfNeeded(match.productId, ingredientName);
        }
      } else if (match.confidence >= 0.7) {
        // Suggest for manual review
        result.suggested_for_review += 1;
        result.details.suggestedForReview.push({
          ingredient: ingredientName,
          bestMatch: match.productName,
          confidence: match.confidence,
        });

        // Create moderation task
        await createModerationTask(
          "link_suggestion",
          null,
          {
            ingredientName,
            suggestedProductId: match.productId,
            suggestedProductName: match.productName,
            confidence: match.confidence,
            recipeIds: data.recipeIds,
          },
          match.confidence
        );
      }
    }

    // 5. Find duplicate products
    const duplicates = findDuplicateCandidates(productList);

    // Filter to high-confidence duplicates
    const highConfidenceDuplicates = duplicates.filter((d) => d.confidence >= 0.85);
    result.duplicates_found = highConfidenceDuplicates.length;
    result.details.duplicates = highConfidenceDuplicates.slice(0, 20); // Limit for response size

    // Create moderation tasks for duplicates
    for (const dup of highConfidenceDuplicates.slice(0, 50)) {
      await createModerationTask(
        "merge_suggestion",
        dup.productId,
        {
          productName: dup.productName,
          matchedWithId: dup.matchedWithId,
          matchedWithName: dup.matchedWithName,
          matchType: dup.matchType,
        },
        dup.confidence
      );
    }

  } catch (error) {
    errors.push(`Unexpected error: ${error instanceof Error ? error.message : "Unknown"}`);
  }

  result.errors = errors;
  result.duration_ms = Date.now() - startTime;

  return NextResponse.json(result);
}

// Also allow POST for manual triggering
export async function POST(request: Request) {
  return GET(request);
}

/**
 * Auto-link ingredient to product in recipes
 */
async function autoLinkIngredient(
  ingredientName: string,
  productId: string,
  productName: string,
  recipeIds: string[]
): Promise<boolean> {
  const targetKey = normalize(ingredientName);
  let updated = 0;

  // Get recipes that contain this ingredient
  const { data: recipes, error } = await supabaseAdmin
    .from("recipes")
    .select("id, ingredients")
    .in("id", recipeIds);

  if (error || !recipes) return false;

  for (const row of recipes) {
    const ingredientsRaw = row.ingredients;
    if (!ingredientsRaw) continue;

    let parsed: any[] = [];
    try {
      parsed = typeof ingredientsRaw === "string"
        ? JSON.parse(ingredientsRaw)
        : (ingredientsRaw as any[]);
    } catch {
      continue;
    }

    if (!Array.isArray(parsed)) continue;

    let changed = false;
    const nextIngredients = parsed.map((ing) => {
      const nameValue =
        typeof ing === "string"
          ? ing.trim()
          : String(ing?.name || ing?.productName || ing?.title || "").trim();

      if (!nameValue || normalize(nameValue) !== targetKey) {
        return ing;
      }

      changed = true;

      if (typeof ing === "string") {
        return {
          id: productId,
          name: productName,
          quantity: 0,
          unit: "g",
        };
      }

      return {
        ...ing,
        id: productId,
        name: productName,
      };
    });

    if (changed) {
      const { error: updateError } = await supabaseAdmin
        .from("recipes")
        .update({ ingredients: JSON.stringify(nextIngredients) })
        .eq("id", row.id);

      if (!updateError) updated += 1;
    }
  }

  return updated > 0;
}

/**
 * Add synonym to product if not already present
 */
async function addSynonymIfNeeded(productId: string, synonym: string): Promise<void> {
  const { data: product } = await supabaseAdmin
    .from("product_dictionary")
    .select("canonical_name, synonyms")
    .eq("id", productId)
    .single();

  if (!product) return;

  const synonyms = Array.isArray(product.synonyms) ? product.synonyms : [];
  const targetKey = normalize(synonym);

  // Check if already exists
  const hasSynonym = synonyms.some((s) => normalize(String(s)) === targetKey);
  if (hasSynonym) return;

  // Don't add if it's the canonical name
  if (normalize(product.canonical_name) === targetKey) return;

  const nextSynonyms = [...synonyms, synonym];
  await supabaseAdmin
    .from("product_dictionary")
    .update({ synonyms: nextSynonyms })
    .eq("id", productId);
}

/**
 * Create moderation task
 */
async function createModerationTask(
  taskType: string,
  productId: string | null,
  suggestedAction: Record<string, unknown>,
  confidence: number
): Promise<void> {
  // Check if similar task already exists
  const { data: existing } = await supabaseAdmin
    .from("moderation_tasks")
    .select("id")
    .eq("task_type", taskType)
    .eq("status", "pending")
    .contains("suggested_action", suggestedAction)
    .limit(1);

  if (existing && existing.length > 0) return;

  await supabaseAdmin.from("moderation_tasks").insert({
    task_type: taskType,
    product_id: productId,
    suggested_action: suggestedAction,
    confidence,
    status: "pending",
  });
}
