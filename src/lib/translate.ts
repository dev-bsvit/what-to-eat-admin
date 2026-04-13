/**
 * DeepL Free API wrapper for recipe/product translation.
 *
 * Required env var: DEEPL_API_KEY (free key from deepl.com/pro#developer)
 * Free tier: 500 000 characters/month — enough for ~500 full recipes.
 *
 * All 8 app languages are supported by DeepL:
 *   en, ru, de, it, fr, es, pt-BR, uk
 */

const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

export const APP_LANGUAGES = ["en", "ru", "de", "it", "fr", "es", "pt-BR", "uk"] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** DeepL uses uppercase codes; pt-BR stays as-is */
const toDeepLCode = (lang: string): string => {
  if (lang === "pt-BR") return "PT-BR";
  if (lang === "uk") return "UK";
  return lang.toUpperCase();
};

// ─────────────────────────────────────────────────────────────────────────────
// Core: batch translate multiple strings in ONE API call
// ─────────────────────────────────────────────────────────────────────────────

export async function translateBatch(
  texts: string[],
  targetLang: string,
  sourceLang?: string
): Promise<string[]> {
  if (!texts.length) return [];

  const apiKey = process.env.DEEPL_API_KEY;
  if (!apiKey) throw new Error("DEEPL_API_KEY is not set");

  const body: Record<string, unknown> = {
    text: texts,
    target_lang: toDeepLCode(targetLang),
  };
  if (sourceLang) body.source_lang = toDeepLCode(sourceLang);

  const res = await fetch(DEEPL_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepL ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { translations: { text: string }[] };
  return data.translations.map((t) => t.text);
}

// ─────────────────────────────────────────────────────────────────────────────
// Recipe translation
// ─────────────────────────────────────────────────────────────────────────────

export interface RecipeContent {
  title: string;
  description?: string | null;
  tips?: string | null;
  serving_tips?: string | null;
  storage_tips?: string | null;
  recipe_note?: string | null;
  instructions?: string[];
}

export interface RecipeTranslationResult {
  title: string;
  description?: string;
  tips?: string;
  serving_tips?: string;
  storage_tips?: string;
  recipe_note?: string;
  instructions?: string[];
}

/**
 * Translate all recipe text fields to one target language.
 * Sends a single batched DeepL request — minimises API quota usage.
 */
export async function translateRecipe(
  recipe: RecipeContent,
  sourceLang: string,
  targetLang: string
): Promise<RecipeTranslationResult> {
  // Build ordered list of (key, text) pairs — only non-empty values
  const pairs: Array<{ key: string; text: string }> = [];

  pairs.push({ key: "title", text: recipe.title });
  if (recipe.description) pairs.push({ key: "description", text: recipe.description });
  if (recipe.tips) pairs.push({ key: "tips", text: recipe.tips });
  if (recipe.serving_tips) pairs.push({ key: "serving_tips", text: recipe.serving_tips });
  if (recipe.storage_tips) pairs.push({ key: "storage_tips", text: recipe.storage_tips });
  if (recipe.recipe_note) pairs.push({ key: "recipe_note", text: recipe.recipe_note });
  recipe.instructions?.forEach((step, i) =>
    pairs.push({ key: `instruction_${i}`, text: step })
  );

  const translated = await translateBatch(
    pairs.map((p) => p.text),
    targetLang,
    sourceLang
  );

  const result: RecipeTranslationResult = { title: "" };
  const instructions: string[] = [];

  pairs.forEach(({ key }, i) => {
    if (key.startsWith("instruction_")) {
      instructions.push(translated[i]);
    } else {
      (result as Record<string, string>)[key] = translated[i];
    }
  });

  if (instructions.length) result.instructions = instructions;
  return result;
}

/**
 * Translate recipe to ALL supported languages except the source.
 * Requests run in parallel (one per language).
 * Returns a map: { en: {...}, ru: {...}, de: {...}, ... }
 */
export async function translateRecipeToAllLanguages(
  recipe: RecipeContent,
  sourceLang: string
): Promise<Record<string, RecipeTranslationResult>> {
  const targets = APP_LANGUAGES.filter((l) => l !== sourceLang);

  const entries = await Promise.all(
    targets.map(async (lang) => {
      const result = await translateRecipe(recipe, sourceLang, lang);
      return [lang, result] as const;
    })
  );

  // Source language stored as-is (no translation needed)
  const sourceEntry: RecipeTranslationResult = {
    title: recipe.title,
    ...(recipe.description ? { description: recipe.description } : {}),
    ...(recipe.tips ? { tips: recipe.tips } : {}),
    ...(recipe.serving_tips ? { serving_tips: recipe.serving_tips } : {}),
    ...(recipe.storage_tips ? { storage_tips: recipe.storage_tips } : {}),
    ...(recipe.recipe_note ? { recipe_note: recipe.recipe_note } : {}),
    ...(recipe.instructions?.length ? { instructions: recipe.instructions } : {}),
  };

  return Object.fromEntries([[sourceLang, sourceEntry], ...entries]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Product translation
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductContent {
  name: string;
  description?: string | null;
  storage_tips?: string | null;
  synonyms?: string[];
}

export interface ProductTranslationResult {
  name: string;
  description?: string;
  storage_tips?: string;
  synonyms?: string[];
}

export async function translateProduct(
  product: ProductContent,
  sourceLang: string,
  targetLang: string
): Promise<ProductTranslationResult> {
  const pairs: Array<{ key: string; text: string }> = [];
  pairs.push({ key: "name", text: product.name });
  if (product.description) pairs.push({ key: "description", text: product.description });
  if (product.storage_tips) pairs.push({ key: "storage_tips", text: product.storage_tips });
  product.synonyms?.forEach((s, i) => pairs.push({ key: `synonym_${i}`, text: s }));

  const translated = await translateBatch(
    pairs.map((p) => p.text),
    targetLang,
    sourceLang
  );

  const result: ProductTranslationResult = { name: "" };
  const synonyms: string[] = [];

  pairs.forEach(({ key }, i) => {
    if (key.startsWith("synonym_")) {
      synonyms.push(translated[i]);
    } else {
      (result as Record<string, string>)[key] = translated[i];
    }
  });

  if (synonyms.length) result.synonyms = synonyms;
  return result;
}

export async function translateProductToAllLanguages(
  product: ProductContent,
  sourceLang: string
): Promise<Record<string, ProductTranslationResult>> {
  const targets = APP_LANGUAGES.filter((l) => l !== sourceLang);

  const entries = await Promise.all(
    targets.map(async (lang) => {
      const result = await translateProduct(product, sourceLang, lang);
      return [lang, result] as const;
    })
  );

  const sourceEntry: ProductTranslationResult = {
    name: product.name,
    ...(product.description ? { description: product.description } : {}),
    ...(product.storage_tips ? { storage_tips: product.storage_tips } : {}),
    ...(product.synonyms?.length ? { synonyms: product.synonyms } : {}),
  };

  return Object.fromEntries([[sourceLang, sourceEntry], ...entries]);
}
