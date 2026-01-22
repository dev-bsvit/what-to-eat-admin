import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/admin/ingredients/translate
 * Получить переводы списка продуктов для всех языков
 * Body: { productIds: string[], languages: string[] }
 * Returns: { translations: Record<productId, Record<languageCode, { name: string }>> }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { productIds, languages } = body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: "productIds array is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(languages) || languages.length === 0) {
      return NextResponse.json(
        { error: "languages array is required" },
        { status: 400 }
      );
    }

    // Получаем переводы из product_translations
    const { data: translationsData, error: translationsError } = await supabaseAdmin
      .from("product_translations")
      .select("product_id, language_code, name")
      .in("product_id", productIds)
      .in("language_code", languages);

    if (translationsError) {
      console.error("Error fetching product translations:", translationsError);
      return NextResponse.json(
        { error: "Failed to fetch translations" },
        { status: 500 }
      );
    }

    // Получаем базовые названия продуктов (fallback)
    const { data: productsData, error: productsError } = await supabaseAdmin
      .from("product_dictionary")
      .select("id, canonical_name")
      .in("id", productIds);

    if (productsError) {
      console.error("Error fetching products:", productsError);
      return NextResponse.json(
        { error: "Failed to fetch products" },
        { status: 500 }
      );
    }

    // Строим структуру переводов
    const translations: Record<string, Record<string, { name: string }>> = {};

    // Инициализируем структуру с fallback названиями
    productsData.forEach((product) => {
      translations[product.id] = {};
      languages.forEach((lang) => {
        translations[product.id][lang] = { name: product.canonical_name };
      });
    });

    // Заполняем переводами
    translationsData.forEach((translation) => {
      if (translations[translation.product_id]) {
        translations[translation.product_id][translation.language_code] = {
          name: translation.name,
        };
      }
    });

    return NextResponse.json({ translations });
  } catch (error) {
    console.error("Error in /api/admin/ingredients/translate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
