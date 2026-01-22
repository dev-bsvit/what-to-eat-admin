import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type RecipeRow = {
  id: string;
  ingredients: unknown;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const commonPrefixLength = (a: string, b: string) => {
  const len = Math.min(a.length, b.length);
  let i = 0;
  for (; i < len; i += 1) {
    if (a[i] !== b[i]) break;
  }
  return i;
};

const isFuzzyMatch = (a: string, b: string) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  return commonPrefixLength(a, b) >= 4;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const productId = String(body.productId || "").trim();

    if (!name) {
      return NextResponse.json({ error: "Missing ingredient name" }, { status: 400 });
    }

    let resolvedProductId = productId;
    let resolvedName = name;

    if (!resolvedProductId) {
      const normalized = normalize(name);
      const { data: exactData } = await supabaseAdmin
        .from("product_dictionary")
        .select("id, canonical_name, synonyms")
        .eq("canonical_name", name)
        .limit(1)
        .single();

      if (exactData?.id) {
        resolvedProductId = exactData.id;
        resolvedName = exactData.canonical_name || name;
      } else {
        const root = normalized.slice(0, 4);
        const { data: candidates, error: candidateError } = await supabaseAdmin
          .from("product_dictionary")
          .select("id, canonical_name, synonyms")
          .ilike("canonical_name", `%${name}%`)
          .limit(200);

        if (candidateError) {
          return NextResponse.json({ error: candidateError.message }, { status: 400 });
        }

        let pool = candidates || [];
        if (pool.length === 0 && root) {
          const { data: rootCandidates, error: rootError } = await supabaseAdmin
            .from("product_dictionary")
            .select("id, canonical_name, synonyms")
            .ilike("canonical_name", `%${root}%`)
            .limit(200);

          if (rootError) {
            return NextResponse.json({ error: rootError.message }, { status: 400 });
          }
          pool = rootCandidates || [];
        }

        const match = pool.find((item) => {
          const canonical = normalize(item.canonical_name || "");
          if (isFuzzyMatch(canonical, normalized)) {
            return true;
          }
          const synonyms = Array.isArray(item.synonyms) ? item.synonyms : [];
          return synonyms.some((syn) => isFuzzyMatch(normalize(String(syn || "")), normalized));
        });

        if (!match) {
          return NextResponse.json({ error: "Product not found by name" }, { status: 400 });
        }
        resolvedProductId = match.id;
        resolvedName = match.canonical_name || name;
      }
    } else {
      const { data: productData } = await supabaseAdmin
        .from("product_dictionary")
        .select("canonical_name, synonyms")
        .eq("id", resolvedProductId)
        .limit(1)
        .single();

      if (productData?.canonical_name) {
        resolvedName = productData.canonical_name;
      }
    }

    if (resolvedProductId) {
      const { data: productData } = await supabaseAdmin
        .from("product_dictionary")
        .select("canonical_name, synonyms")
        .eq("id", resolvedProductId)
        .limit(1)
        .single();

      if (productData) {
        if (productData.canonical_name) {
          resolvedName = productData.canonical_name;
        }
        const synonyms = Array.isArray(productData.synonyms) ? productData.synonyms : [];
        const targetKey = normalize(name);
        const hasSynonym = synonyms.some((syn) => normalize(String(syn)) === targetKey);
        if (!hasSynonym && targetKey !== normalize(resolvedName)) {
          const nextSynonyms = [...synonyms, name];
          await supabaseAdmin.from("product_dictionary").update({ synonyms: nextSynonyms }).eq("id", resolvedProductId);
        }
      }
    }

    const { data: recipes, error: recipeError } = await supabaseAdmin
      .from("recipes")
      .select("id, ingredients");

    if (recipeError) {
      return NextResponse.json({ error: recipeError.message }, { status: 400 });
    }

    let updated = 0;
    const targetKey = normalize(name);

    for (const row of (recipes || []) as RecipeRow[]) {
      const ingredientsRaw = row.ingredients;
      if (!ingredientsRaw) {
        continue;
      }
      let parsed: any[] = [];
      try {
        parsed = typeof ingredientsRaw === "string" ? JSON.parse(ingredientsRaw) : (ingredientsRaw as any[]);
      } catch (error) {
        continue;
      }
      if (!Array.isArray(parsed)) {
        continue;
      }

      let changed = false;
      const nextIngredients = parsed.map((ing) => {
        const nameValue =
          typeof ing === "string"
            ? ing.trim()
            : String(ing?.name || ing?.productName || ing?.title || "").trim();
        if (!nameValue) {
          return ing;
        }
        if (normalize(nameValue) !== targetKey) {
          return ing;
        }
        changed = true;
        if (typeof ing === "object") {
          const idValue = String((ing as { id?: string | null }).id || "").trim();
          if (idValue && isUuid(idValue) && idValue === resolvedProductId) {
            return ing;
          }
        }
        if (typeof ing === "string") {
          return {
            id: resolvedProductId,
            name: resolvedName,
            quantity: 0,
            unit: "g",
          };
        }
        return {
          ...ing,
          id: resolvedProductId,
          name: resolvedName,
        };
      });

      if (changed) {
        const { error: updateError } = await supabaseAdmin
          .from("recipes")
          .update({ ingredients: JSON.stringify(nextIngredients) })
          .eq("id", row.id);
        if (!updateError) {
          updated += 1;
        }
      }
    }

    return NextResponse.json({ updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
