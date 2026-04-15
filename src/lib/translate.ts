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

  const result = { title: "" } as Record<string, unknown>;
  const instructions: string[] = [];

  pairs.forEach(({ key }, i) => {
    if (key.startsWith("instruction_")) {
      instructions.push(translated[i]);
    } else {
      result[key] = translated[i];
    }
  });

  if (instructions.length) result.instructions = instructions;
  return result as unknown as RecipeTranslationResult;
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

  const result = { name: "" } as Record<string, unknown>;
  const synonyms: string[] = [];

  pairs.forEach(({ key }, i) => {
    if (key.startsWith("synonym_")) {
      synonyms.push(translated[i]);
    } else {
      result[key] = translated[i];
    }
  });

  if (synonyms.length) result.synonyms = synonyms;
  return result as unknown as ProductTranslationResult;
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

// ─────────────────────────────────────────────────────────────────────────────
// Catalog Landing translation
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal text-only shape of a landing for translation */
export interface LandingTextContent {
  preview_card_title: string;
  preview_card_subtitle?: string;
  preview_card_badges: string[];

  hero_title: string;
  hero_subtitle?: string;
  hero_badges: string[];

  inside_title?: string;
  inside_subtitle?: string;
  inside_items: Array<{ id: string; emoji?: string; title?: string; text: string }>;

  recipe_showcase_title?: string;
  recipe_showcase_subtitle?: string;

  audience_title?: string;
  audience_subtitle?: string;
  audience_items: Array<{ id: string; emoji?: string; title?: string; text: string }>;

  transformation_title?: string;
  transformation_subtitle?: string;
  transformation_before_label?: string;
  transformation_after_label?: string;
  transformation_pairs: Array<{ id: string; beforeText: string; afterText: string }>;

  benefits_title?: string;
  benefits_subtitle?: string;
  benefits_cards: Array<{ id: string; eyebrow?: string; title: string; text: string }>;

  faq_items: Array<{ id: string; question: string; answer: string }>;

  cta_title?: string;
  cta_subtitle?: string;
  cta_features: Array<{ id: string; title: string; subtitle?: string }>;
  cta_button_title?: string;
}

export type LandingTranslationResult = LandingTextContent;

/**
 * Translate all landing text fields to one target language in one batch call.
 */
export async function translateLanding(
  content: LandingTextContent,
  sourceLang: string,
  targetLang: string
): Promise<LandingTranslationResult> {
  type Pair = { key: string; text: string };
  const pairs: Pair[] = [];
  const push = (key: string, text?: string | null) => { if (text) pairs.push({ key, text }); };

  push("preview_card_title", content.preview_card_title);
  push("preview_card_subtitle", content.preview_card_subtitle);
  content.preview_card_badges.forEach((b, i) => push(`preview_card_badge_${i}`, b));

  push("hero_title", content.hero_title);
  push("hero_subtitle", content.hero_subtitle);
  content.hero_badges.forEach((b, i) => push(`hero_badge_${i}`, b));

  push("inside_title", content.inside_title);
  push("inside_subtitle", content.inside_subtitle);
  content.inside_items.forEach((item, i) => {
    push(`inside_item_${i}_title`, item.title);
    push(`inside_item_${i}_text`, item.text);
  });

  push("recipe_showcase_title", content.recipe_showcase_title);
  push("recipe_showcase_subtitle", content.recipe_showcase_subtitle);

  push("audience_title", content.audience_title);
  push("audience_subtitle", content.audience_subtitle);
  content.audience_items.forEach((item, i) => {
    push(`audience_item_${i}_title`, item.title);
    push(`audience_item_${i}_text`, item.text);
  });

  push("transformation_title", content.transformation_title);
  push("transformation_subtitle", content.transformation_subtitle);
  push("transformation_before_label", content.transformation_before_label);
  push("transformation_after_label", content.transformation_after_label);
  content.transformation_pairs.forEach((p, i) => {
    push(`transformation_pair_${i}_before`, p.beforeText);
    push(`transformation_pair_${i}_after`, p.afterText);
  });

  push("benefits_title", content.benefits_title);
  push("benefits_subtitle", content.benefits_subtitle);
  content.benefits_cards.forEach((c, i) => {
    push(`benefit_card_${i}_eyebrow`, c.eyebrow);
    push(`benefit_card_${i}_title`, c.title);
    push(`benefit_card_${i}_text`, c.text);
  });

  content.faq_items.forEach((f, i) => {
    push(`faq_${i}_question`, f.question);
    push(`faq_${i}_answer`, f.answer);
  });

  push("cta_title", content.cta_title);
  push("cta_subtitle", content.cta_subtitle);
  content.cta_features.forEach((f, i) => {
    push(`cta_feature_${i}_title`, f.title);
    push(`cta_feature_${i}_subtitle`, f.subtitle);
  });
  push("cta_button_title", content.cta_button_title);

  const translated = await translateBatch(pairs.map((p) => p.text), targetLang, sourceLang);
  const t: Record<string, string> = {};
  pairs.forEach(({ key }, i) => { t[key] = translated[i]; });
  const get = (key: string) => t[key] ?? undefined;

  return {
    preview_card_title: get("preview_card_title") ?? content.preview_card_title,
    preview_card_subtitle: get("preview_card_subtitle"),
    preview_card_badges: content.preview_card_badges.map((b, i) => get(`preview_card_badge_${i}`) ?? b),
    hero_title: get("hero_title") ?? content.hero_title,
    hero_subtitle: get("hero_subtitle"),
    hero_badges: content.hero_badges.map((b, i) => get(`hero_badge_${i}`) ?? b),
    inside_title: get("inside_title"),
    inside_subtitle: get("inside_subtitle"),
    inside_items: content.inside_items.map((item, i) => ({ ...item, title: get(`inside_item_${i}_title`) ?? item.title, text: get(`inside_item_${i}_text`) ?? item.text })),
    recipe_showcase_title: get("recipe_showcase_title"),
    recipe_showcase_subtitle: get("recipe_showcase_subtitle"),
    audience_title: get("audience_title"),
    audience_subtitle: get("audience_subtitle"),
    audience_items: content.audience_items.map((item, i) => ({ ...item, title: get(`audience_item_${i}_title`) ?? item.title, text: get(`audience_item_${i}_text`) ?? item.text })),
    transformation_title: get("transformation_title"),
    transformation_subtitle: get("transformation_subtitle"),
    transformation_before_label: get("transformation_before_label"),
    transformation_after_label: get("transformation_after_label"),
    transformation_pairs: content.transformation_pairs.map((p, i) => ({ ...p, beforeText: get(`transformation_pair_${i}_before`) ?? p.beforeText, afterText: get(`transformation_pair_${i}_after`) ?? p.afterText })),
    benefits_title: get("benefits_title"),
    benefits_subtitle: get("benefits_subtitle"),
    benefits_cards: content.benefits_cards.map((c, i) => ({ ...c, eyebrow: get(`benefit_card_${i}_eyebrow`) ?? c.eyebrow, title: get(`benefit_card_${i}_title`) ?? c.title, text: get(`benefit_card_${i}_text`) ?? c.text })),
    faq_items: content.faq_items.map((f, i) => ({ ...f, question: get(`faq_${i}_question`) ?? f.question, answer: get(`faq_${i}_answer`) ?? f.answer })),
    cta_title: get("cta_title"),
    cta_subtitle: get("cta_subtitle"),
    cta_features: content.cta_features.map((f, i) => ({ ...f, title: get(`cta_feature_${i}_title`) ?? f.title, subtitle: get(`cta_feature_${i}_subtitle`) ?? f.subtitle })),
    cta_button_title: get("cta_button_title"),
  };
}

/** Extract text content from raw JSONB landing data */
export function extractLandingText(landing: Record<string, unknown>): LandingTextContent {
  const pc = (landing.preview_card ?? {}) as Record<string, unknown>;
  const hero = (landing.hero ?? {}) as Record<string, unknown>;
  const inside = (landing.inside_section ?? null) as Record<string, unknown> | null;
  const showcase = (landing.recipe_showcase ?? null) as Record<string, unknown> | null;
  const audience = (landing.audience_section ?? null) as Record<string, unknown> | null;
  const transform = (landing.transformation_section ?? null) as Record<string, unknown> | null;
  const benefits = (landing.benefits_section ?? null) as Record<string, unknown> | null;
  const faqs = (landing.faq_items ?? []) as Array<Record<string, unknown>>;
  const cta = (landing.purchase_cta ?? null) as Record<string, unknown> | null;

  return {
    preview_card_title: String(pc.title ?? ""),
    preview_card_subtitle: pc.subtitle ? String(pc.subtitle) : undefined,
    preview_card_badges: Array.isArray(pc.badges) ? pc.badges.map(String) : [],
    hero_title: String(hero.title ?? ""),
    hero_subtitle: hero.subtitle ? String(hero.subtitle) : undefined,
    hero_badges: Array.isArray(hero.badges) ? hero.badges.map(String) : [],
    inside_title: inside?.title ? String(inside.title) : undefined,
    inside_subtitle: inside?.subtitle ? String(inside.subtitle) : undefined,
    inside_items: Array.isArray(inside?.items) ? (inside!.items as Array<Record<string, unknown>>).map((it) => ({ id: String(it.id ?? ""), emoji: it.emoji ? String(it.emoji) : undefined, title: it.title ? String(it.title) : undefined, text: String(it.text ?? "") })) : [],
    recipe_showcase_title: showcase?.title ? String(showcase.title) : undefined,
    recipe_showcase_subtitle: showcase?.subtitle ? String(showcase.subtitle) : undefined,
    audience_title: audience?.title ? String(audience.title) : undefined,
    audience_subtitle: audience?.subtitle ? String(audience.subtitle) : undefined,
    audience_items: Array.isArray(audience?.items) ? (audience!.items as Array<Record<string, unknown>>).map((it) => ({ id: String(it.id ?? ""), emoji: it.emoji ? String(it.emoji) : undefined, title: it.title ? String(it.title) : undefined, text: String(it.text ?? "") })) : [],
    transformation_title: transform?.title ? String(transform.title) : undefined,
    transformation_subtitle: transform?.subtitle ? String(transform.subtitle) : undefined,
    transformation_before_label: transform?.beforeLabel ? String(transform.beforeLabel) : undefined,
    transformation_after_label: transform?.afterLabel ? String(transform.afterLabel) : undefined,
    transformation_pairs: Array.isArray(transform?.pairs) ? (transform!.pairs as Array<Record<string, unknown>>).map((p) => ({ id: String(p.id ?? ""), beforeText: String(p.beforeText ?? ""), afterText: String(p.afterText ?? "") })) : [],
    benefits_title: benefits?.title ? String(benefits.title) : undefined,
    benefits_subtitle: benefits?.subtitle ? String(benefits.subtitle) : undefined,
    benefits_cards: Array.isArray(benefits?.cards) ? (benefits!.cards as Array<Record<string, unknown>>).map((c) => ({ id: String(c.id ?? ""), eyebrow: c.eyebrow ? String(c.eyebrow) : undefined, title: String(c.title ?? ""), text: String(c.text ?? "") })) : [],
    faq_items: faqs.map((f) => ({ id: String(f.id ?? ""), question: String(f.question ?? ""), answer: String(f.answer ?? "") })),
    cta_title: cta?.title ? String(cta.title) : undefined,
    cta_subtitle: cta?.subtitle ? String(cta.subtitle) : undefined,
    cta_features: Array.isArray(cta?.features) ? (cta!.features as Array<Record<string, unknown>>).map((f) => ({ id: String(f.id ?? ""), title: String(f.title ?? ""), subtitle: f.subtitle ? String(f.subtitle) : undefined })) : [],
    cta_button_title: cta?.buttonTitle ? String(cta.buttonTitle) : undefined,
  };
}

/** Translate landing to all 7 other languages in parallel */
export async function translateLandingToAllLanguages(
  landing: Record<string, unknown>,
  sourceLang: string
): Promise<Record<string, LandingTranslationResult>> {
  const content = extractLandingText(landing);
  const targets = APP_LANGUAGES.filter((l) => l !== sourceLang);
  const entries = await Promise.all(
    targets.map(async (lang) => [lang, await translateLanding(content, sourceLang, lang)] as const)
  );
  return Object.fromEntries([[sourceLang, content], ...entries]);
}
