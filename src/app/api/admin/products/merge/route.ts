import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalize } from "@/lib/stringUtils";

interface MergeRequest {
  primaryId: string;
  mergeIds: string[];
}

export async function POST(request: Request) {
  try {
    const body: MergeRequest = await request.json();
    const { primaryId, mergeIds } = body;

    if (!primaryId || !mergeIds || mergeIds.length === 0) {
      return NextResponse.json(
        { error: "Missing primaryId or mergeIds" },
        { status: 400 }
      );
    }

    // Don't allow merging product with itself
    const filteredMergeIds = mergeIds.filter((id) => id !== primaryId);
    if (filteredMergeIds.length === 0) {
      return NextResponse.json(
        { error: "No valid products to merge" },
        { status: 400 }
      );
    }

    // 1. Get primary product
    const { data: primary, error: primaryError } = await supabaseAdmin
      .from("product_dictionary")
      .select("*")
      .eq("id", primaryId)
      .single();

    if (primaryError || !primary) {
      return NextResponse.json(
        { error: "Primary product not found" },
        { status: 404 }
      );
    }

    // 2. Get products to merge
    const { data: toMerge, error: mergeError } = await supabaseAdmin
      .from("product_dictionary")
      .select("*")
      .in("id", filteredMergeIds);

    if (mergeError || !toMerge || toMerge.length === 0) {
      return NextResponse.json(
        { error: "Products to merge not found" },
        { status: 404 }
      );
    }

    // 3. Collect all synonyms
    const allSynonyms = new Set<string>(
      Array.isArray(primary.synonyms) ? primary.synonyms : []
    );

    // Add canonical names and synonyms from merged products
    for (const product of toMerge) {
      // Add canonical name as synonym
      if (product.canonical_name) {
        const normalized = normalize(product.canonical_name);
        if (normalized !== normalize(primary.canonical_name)) {
          allSynonyms.add(product.canonical_name);
        }
      }

      // Add display name if different
      if (product.display_name && product.display_name !== product.canonical_name) {
        allSynonyms.add(product.display_name);
      }

      // Add existing synonyms
      if (Array.isArray(product.synonyms)) {
        product.synonyms.forEach((syn: string) => {
          if (syn && normalize(syn) !== normalize(primary.canonical_name)) {
            allSynonyms.add(syn);
          }
        });
      }
    }

    // 4. Calculate combined usage count
    const totalUsageCount = (primary.usage_count || 0) +
      toMerge.reduce((sum, p) => sum + (p.usage_count || 0), 0);

    // 5. Update primary product with all synonyms
    const { error: updatePrimaryError } = await supabaseAdmin
      .from("product_dictionary")
      .update({
        synonyms: Array.from(allSynonyms),
        usage_count: totalUsageCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", primaryId);

    if (updatePrimaryError) {
      return NextResponse.json(
        { error: `Failed to update primary: ${updatePrimaryError.message}` },
        { status: 500 }
      );
    }

    // 6. Update recipe_ingredients to point to primary
    let ingredientsUpdated = 0;
    for (const mergeId of filteredMergeIds) {
      const { data } = await supabaseAdmin
        .from("recipe_ingredients")
        .update({ product_dictionary_id: primaryId })
        .eq("product_dictionary_id", mergeId)
        .select("id");

      ingredientsUpdated += data?.length || 0;
    }

    // 7. Update pantry_items to point to primary
    let pantryUpdated = 0;
    for (const mergeId of filteredMergeIds) {
      const { data } = await supabaseAdmin
        .from("pantry_items")
        .update({ product_dictionary_id: primaryId })
        .eq("product_dictionary_id", mergeId)
        .select("id");

      pantryUpdated += data?.length || 0;
    }

    // 8. Update shopping_list_items if they reference product
    // (shopping list uses name, but we can update linked items)

    // 9. Delete merged products
    const { error: deleteError } = await supabaseAdmin
      .from("product_dictionary")
      .delete()
      .in("id", filteredMergeIds);

    if (deleteError) {
      return NextResponse.json(
        { error: `Failed to delete merged products: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // 10. Update moderation tasks
    await supabaseAdmin
      .from("moderation_tasks")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .or(`product_id.eq.${primaryId},suggested_action->matchedWithId.eq.${primaryId}`)
      .eq("task_type", "merge_suggestion")
      .eq("status", "pending");

    return NextResponse.json({
      success: true,
      mergedCount: filteredMergeIds.length,
      synonymsAdded: allSynonyms.size - (primary.synonyms?.length || 0),
      ingredientsUpdated,
      pantryUpdated,
      primaryProduct: {
        id: primaryId,
        name: primary.canonical_name,
        totalSynonyms: allSynonyms.size,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
