import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface FillRequest {
  productIds: string[];
}

interface AIProductData {
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrates?: number;
  fiber?: number;
  description?: string;
  storage_tips?: string;
  typical_serving?: number;
  default_shelf_life_days?: number;
  requires_expiry?: boolean;
  synonyms?: string[];
}

async function fetchAIData(productName: string): Promise<AIProductData | null> {
  try {
    const aiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL || "http://localhost:3000";
    const response = await fetch(`${aiApiUrl}/api/admin/ai/product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: productName }),
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    return result.data || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body: FillRequest = await request.json();
    const { productIds } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty productIds array" },
        { status: 400 }
      );
    }

    // Limit batch size
    const limitedIds = productIds.slice(0, 20);

    // Get products to fill
    const { data: products, error: fetchError } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name, calories, protein, fat, carbohydrates, fiber, description, storage_tips, typical_serving, default_shelf_life_days, requires_expiry, synonyms")
      .in("id", limitedIds);

    if (fetchError || !products) {
      return NextResponse.json(
        { error: fetchError?.message || "Products not found" },
        { status: 400 }
      );
    }

    const results: { id: string; name: string; success: boolean; fieldsUpdated: number }[] = [];

    for (const product of products) {
      const aiData = await fetchAIData(product.canonical_name);

      if (!aiData) {
        results.push({ id: product.id, name: product.canonical_name, success: false, fieldsUpdated: 0 });
        continue;
      }

      // Build update object only for null fields
      const updates: Record<string, unknown> = {};
      let fieldsUpdated = 0;

      const fieldsToCheck: Array<{ key: keyof AIProductData; dbKey: string }> = [
        { key: "calories", dbKey: "calories" },
        { key: "protein", dbKey: "protein" },
        { key: "fat", dbKey: "fat" },
        { key: "carbohydrates", dbKey: "carbohydrates" },
        { key: "fiber", dbKey: "fiber" },
        { key: "description", dbKey: "description" },
        { key: "storage_tips", dbKey: "storage_tips" },
        { key: "typical_serving", dbKey: "typical_serving" },
        { key: "default_shelf_life_days", dbKey: "default_shelf_life_days" },
        { key: "requires_expiry", dbKey: "requires_expiry" },
      ];

      for (const { key, dbKey } of fieldsToCheck) {
        const currentValue = product[dbKey as keyof typeof product];
        const aiValue = aiData[key];

        if ((currentValue === null || currentValue === undefined) && aiValue !== null && aiValue !== undefined) {
          updates[dbKey] = aiValue;
          fieldsUpdated++;
        }
      }

      // Handle synonyms specially - merge arrays
      if (aiData.synonyms && Array.isArray(aiData.synonyms)) {
        const existingSynonyms = Array.isArray(product.synonyms) ? product.synonyms : [];
        const newSynonyms = [...new Set([...existingSynonyms, ...aiData.synonyms])];
        if (newSynonyms.length > existingSynonyms.length) {
          updates.synonyms = newSynonyms;
          fieldsUpdated++;
        }
      }

      if (fieldsUpdated > 0) {
        updates.updated_at = new Date().toISOString();
        updates.needs_moderation = false;

        const { error: updateError } = await supabaseAdmin
          .from("product_dictionary")
          .update(updates)
          .eq("id", product.id);

        results.push({
          id: product.id,
          name: product.canonical_name,
          success: !updateError,
          fieldsUpdated: updateError ? 0 : fieldsUpdated,
        });
      } else {
        results.push({
          id: product.id,
          name: product.canonical_name,
          success: true,
          fieldsUpdated: 0,
        });
      }

      // Small delay between AI calls to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const totalUpdated = results.filter((r) => r.success && r.fieldsUpdated > 0).length;
    const totalFields = results.reduce((sum, r) => sum + r.fieldsUpdated, 0);

    return NextResponse.json({
      success: true,
      processed: results.length,
      updated: totalUpdated,
      totalFieldsUpdated: totalFields,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
