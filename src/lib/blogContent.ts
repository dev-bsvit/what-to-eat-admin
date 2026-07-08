import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidateBlogPaths } from "@/lib/revalidateBlog";
import { slugify } from "@/lib/slug";

export { slugify };

export const DEFAULT_LANGUAGE = "ru";
export const APP_LANGUAGES = ["ru", "en", "de", "it", "fr", "es", "pt-BR", "uk"] as const;
export const VALID_STATUSES = new Set(["draft", "in_review", "scheduled", "published", "archived"]);
export const VALID_ARTICLE_TYPES = new Set(["guide", "recipe", "collection"]);
export const VALID_SOURCES = new Set(["manual", "ai_generated", "ai_assisted"]);

export type JsonRecord = Record<string, unknown>;

export interface ImportSection {
  type: "h2" | "h3" | "p" | "ul" | "ol" | "blockquote" | "image";
  text?: string;
  items?: string[];
  src?: string;
  alt?: string;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

export function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isUuid(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textNode(text: string) {
  return { type: "text", text };
}

function paragraphNode(text: string) {
  return { type: "paragraph", content: [textNode(text)] };
}

function listNode(type: "bulletList" | "orderedList", items: string[]) {
  return {
    type,
    ...(type === "orderedList" ? { attrs: { start: 1 } } : {}),
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraphNode(item)],
    })),
  };
}

export function normalizeSections(value: unknown): ImportSection[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((section) => ({
      type: asString(section.type) as ImportSection["type"],
      text: asString(section.text),
      items: Array.isArray(section.items) ? section.items.map(asString).filter(Boolean) : undefined,
      src: asString(section.src),
      alt: asString(section.alt),
    }))
    .filter((section) => ["h2", "h3", "p", "ul", "ol", "blockquote", "image"].includes(section.type));
}

function renderSections(sections: ImportSection[]) {
  const contentJson = { type: "doc", content: [] as JsonRecord[] };
  const htmlParts: string[] = [];

  for (const section of sections) {
    if (section.type === "h2" || section.type === "h3") {
      if (!section.text) continue;
      const level = section.type === "h2" ? 2 : 3;
      contentJson.content.push({ type: "heading", attrs: { level }, content: [textNode(section.text)] });
      htmlParts.push(`<h${level}>${escapeHtml(section.text)}</h${level}>`);
      continue;
    }
    if (section.type === "p") {
      if (!section.text) continue;
      contentJson.content.push(paragraphNode(section.text));
      htmlParts.push(`<p>${escapeHtml(section.text)}</p>`);
      continue;
    }
    if (section.type === "blockquote") {
      if (!section.text) continue;
      contentJson.content.push({ type: "blockquote", content: [paragraphNode(section.text)] });
      htmlParts.push(`<blockquote><p>${escapeHtml(section.text)}</p></blockquote>`);
      continue;
    }
    if (section.type === "ul" || section.type === "ol") {
      const items = section.items ?? [];
      if (items.length === 0) continue;
      const tag = section.type === "ul" ? "ul" : "ol";
      contentJson.content.push(listNode(section.type === "ul" ? "bulletList" : "orderedList", items));
      htmlParts.push(`<${tag}>${items.map((item) => `<li><p>${escapeHtml(item)}</p></li>`).join("")}</${tag}>`);
      continue;
    }
    if (section.type === "image") {
      if (!section.src) continue;
      contentJson.content.push({ type: "image", attrs: { src: section.src, alt: section.alt || null, title: null } });
      htmlParts.push(`<img src="${escapeHtml(section.src)}" alt="${escapeHtml(section.alt || "")}">`);
    }
  }

  return { content_json: contentJson, content_html: htmlParts.join("\n") };
}

export function renderArticleContent(article: JsonRecord) {
  const sections = normalizeSections(article.sections);
  const rendered = sections.length > 0 ? renderSections(sections) : null;
  const contentJson = isRecord(article.content_json) ? article.content_json : rendered?.content_json ?? { type: "doc", content: [] };
  const contentHtml = asString(article.content_html) || rendered?.content_html || null;
  return { contentJson, contentHtml };
}

// category.translations: { [language_code]: { name, description? } }
export async function ensureCategory(category: unknown, primaryLanguage: string) {
  if (!isRecord(category)) return null;

  const translationsInput = isRecord(category.translations)
    ? (category.translations as Record<string, unknown>)
    : { [primaryLanguage]: { name: category.name, description: category.description } };

  const primaryName = asString(
    isRecord(translationsInput[primaryLanguage]) ? (translationsInput[primaryLanguage] as JsonRecord).name : category.name
  );
  const slug = slugify(asString(category.slug) || primaryName);
  if (!slug) return null;

  const { data, error } = await supabaseAdmin
    .from("blog_categories")
    .upsert({ slug, icon: asNullableString(category.icon), sort_order: asNumber(category.sort_order) ?? 0 }, { onConflict: "slug" })
    .select("id, slug")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create category");

  const rows = Object.entries(translationsInput)
    .filter(([, value]) => isRecord(value))
    .map(([languageCode, value]) => ({
      category_id: data.id,
      language_code: languageCode,
      name: asString((value as JsonRecord).name),
      description: asNullableString((value as JsonRecord).description),
    }))
    .filter((row) => row.language_code && row.name);

  if (rows.length > 0) {
    const { error: translationError } = await supabaseAdmin
      .from("blog_category_translations")
      .upsert(rows, { onConflict: "category_id,language_code" });
    if (translationError) throw new Error(translationError.message);
  }

  return data as { id: string; slug: string };
}

export async function ensureAuthor(author: unknown) {
  if (!isRecord(author)) return null;

  const id = asString(author.id);
  if (isUuid(id)) return id;

  const name = asString(author.name);
  if (!name) return null;

  const { data: existing } = await supabaseAdmin.from("blog_authors").select("id").eq("name", name).limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabaseAdmin
    .from("blog_authors")
    .insert({
      name,
      title: asNullableString(author.title),
      bio: asNullableString(author.bio),
      avatar_url: asNullableString(author.avatar_url),
      profile_url: asNullableString(author.profile_url),
      same_as: Array.isArray(author.same_as) ? author.same_as.map(asString).filter(Boolean) : [],
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to create author");
  return data.id as string;
}

export interface RecipeMatch {
  id: string;
  title: string;
  // Set only when resolved via fuzzy fallback rather than an exact title
  // match, so callers can surface a "matched X instead of Y" warning.
  matchedTitle: string | null;
}

// AI-generated titles are frequently *close* to a real recipe's title but not
// byte-identical (word order, missing punctuation, a synonym). An exact-only
// lookup rejects the whole import on this alone, forcing a manual round-trip.
// This tries an exact match first, then falls back to a word-overlap search
// so near-miss titles still resolve (with a warning), and only genuinely
// invented titles fail to resolve at all.
async function fuzzySearchRecipe(title: string): Promise<RecipeMatch | null> {
  const { data: exact, error: exactError } = await supabaseAdmin
    .from("recipes")
    .select("id, title")
    .ilike("title", title)
    .limit(1)
    .maybeSingle();
  if (exactError) throw new Error(exactError.message);
  if (exact?.id) return { id: exact.id as string, title: exact.title as string, matchedTitle: null };

  const words = title
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9а-яё]/gi, ""))
    .filter((word) => word.length >= 3);
  if (words.length === 0) return null;

  const orFilter = words.map((word) => `title.ilike.%${word}%`).join(",");
  const { data: candidates, error: candidatesError } = await supabaseAdmin.from("recipes").select("id, title").or(orFilter).limit(30);
  if (candidatesError) throw new Error(candidatesError.message);
  if (!candidates || candidates.length === 0) return null;

  let best: { id: string; title: string; score: number } | null = null;
  for (const candidate of candidates) {
    const candidateTitle = String(candidate.title).toLowerCase();
    const score = words.filter((word) => candidateTitle.includes(word)).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { id: candidate.id as string, title: candidate.title as string, score };
    }
  }

  const threshold = Math.max(1, Math.ceil(words.length / 2));
  if (!best || best.score < threshold) return null;
  return { id: best.id, title: best.title, matchedTitle: best.title };
}

export async function resolveRecipeByTitleOrId(recipeId: unknown, recipeTitle: unknown): Promise<RecipeMatch | null> {
  const id = asString(recipeId);
  if (isUuid(id)) return { id, title: "", matchedTitle: null };

  const title = asString(recipeTitle);
  if (!title) return null;

  return fuzzySearchRecipe(title);
}

export interface RelatedRecipesResult {
  recipes: Array<{ id: string; label: string | null; note: string | null }>;
  // Human-readable notes about fuzzy-matched or unresolved titles, meant to
  // be surfaced to the user rather than aborting the whole import.
  warnings: string[];
}

export async function resolveRelatedRecipes(value: unknown): Promise<RelatedRecipesResult> {
  const result: RelatedRecipesResult = { recipes: [], warnings: [] };
  if (!Array.isArray(value)) return result;

  for (const rawRecipe of value) {
    const recipe = typeof rawRecipe === "string" ? { title: rawRecipe } : rawRecipe;
    if (!isRecord(recipe)) continue;

    const id = asString(recipe.id) || asString(recipe.recipe_id);
    if (isUuid(id)) {
      result.recipes.push({ id, label: asNullableString(recipe.label), note: asNullableString(recipe.note) });
      continue;
    }

    const title = asString(recipe.title) || asString(recipe.recipe_title);
    if (!title) continue;

    const match = await fuzzySearchRecipe(title);
    if (!match) {
      result.warnings.push(`Рецепт "${title}" не найден в базе — пропущен.`);
      continue;
    }
    if (match.matchedTitle) {
      result.warnings.push(`Рецепт "${title}" не найден точно — использован ближайший: "${match.matchedTitle}".`);
    }
    result.recipes.push({ id: match.id, label: asNullableString(recipe.label), note: asNullableString(recipe.note) });
  }

  return result;
}

// tag.translations: { [language_code]: name }
export async function ensureTags(tags: unknown, primaryLanguage: string) {
  if (!Array.isArray(tags)) return [];

  const result: Array<{ id: string; slug: string }> = [];
  for (const rawTag of tags) {
    const tag = typeof rawTag === "string" ? { slug: rawTag, name: rawTag } : rawTag;
    if (!isRecord(tag)) continue;

    const translationsInput = isRecord(tag.translations)
      ? (tag.translations as Record<string, unknown>)
      : { [primaryLanguage]: tag.name ?? tag.slug };
    const primaryName = asString(translationsInput[primaryLanguage]) || asString(tag.name);
    const slug = slugify(asString(tag.slug) || primaryName);
    if (!slug) continue;

    const { data, error } = await supabaseAdmin.from("blog_tags").upsert({ slug }, { onConflict: "slug" }).select("id, slug").single();
    if (error || !data) throw new Error(error?.message || "Failed to create tag");

    const rows = Object.entries(translationsInput)
      .map(([code, value]) => ({ tag_id: data.id, language_code: code, name: asString(value) }))
      .filter((row) => row.language_code && row.name);

    if (rows.length > 0) {
      const { error: translationError } = await supabaseAdmin
        .from("blog_tag_translations")
        .upsert(rows, { onConflict: "tag_id,language_code" });
      if (translationError) throw new Error(translationError.message);
    }

    result.push(data as { id: string; slug: string });
  }

  return result;
}

export interface UpsertPostInput {
  postId?: string;
  status: string;
  source: string;
  articleType: string;
  recipeId: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  authorId: string | null;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  readingTimeMin: number | null;
  tags: Array<{ id: string; slug: string }>;
  relatedRecipes: Array<{ id: string; label: string | null; note: string | null }>;
  // languageCode -> article fields (title/slug/excerpt/tldr/meta/sections|content/faq_json)
  translations: Record<string, JsonRecord>;
}

// Shared by /api/admin/blog/import and /api/admin/blog/generate — creates or
// updates a post plus every language's translation, tags, and related
// recipes in one call, and fires the on-demand revalidation webhook.
export async function upsertBlogPost(input: UpsertPostInput) {
  const languageCodes = Object.keys(input.translations);
  const now = new Date().toISOString();

  const perLanguage: Record<string, { title: string; slug: string; article: JsonRecord }> = {};
  for (const languageCode of languageCodes) {
    const article = input.translations[languageCode];
    const title = asString(article.title);
    const slug = slugify(asString(article.slug) || title);
    if (!title || !slug) throw new Error(`translations.${languageCode}.title and .slug are required`);
    perLanguage[languageCode] = { title, slug, article };
  }

  let postId = input.postId;
  if (!postId) {
    for (const languageCode of languageCodes) {
      const { data: existingTranslation } = await supabaseAdmin
        .from("blog_post_translations")
        .select("post_id")
        .eq("language_code", languageCode)
        .eq("slug", perLanguage[languageCode].slug)
        .maybeSingle();
      if (existingTranslation?.post_id) {
        postId = existingTranslation.post_id as string;
        break;
      }
    }
  }

  const postFields = {
    status: input.status,
    source: input.source,
    article_type: input.articleType,
    recipe_id: input.recipeId,
    category_id: input.categoryId,
    author_id: input.authorId,
    cover_image_url: input.coverImageUrl,
    cover_image_alt: input.coverImageAlt,
    reading_time_min: input.readingTimeMin,
  };

  if (postId) {
    const { data: existingPost } = await supabaseAdmin.from("blog_posts").select("published_at").eq("id", postId).single();
    const existingPublishedAt = (existingPost?.published_at as string | null) ?? null;
    const { error } = await supabaseAdmin
      .from("blog_posts")
      .update({ ...postFields, published_at: input.status === "published" ? existingPublishedAt ?? now : null, updated_at: now })
      .eq("id", postId);
    if (error) throw new Error(error.message);
  } else {
    const { data: post, error } = await supabaseAdmin
      .from("blog_posts")
      .insert({ ...postFields, published_at: input.status === "published" ? now : null })
      .select("id")
      .single();
    if (error || !post) throw new Error(error?.message || "Failed to create post");
    postId = post.id as string;
  }
  if (!postId) throw new Error("Failed to resolve post id");

  const translationRows = languageCodes.map((languageCode) => {
    const { title, slug, article } = perLanguage[languageCode];
    const { contentJson, contentHtml } = renderArticleContent(article);
    return {
      post_id: postId,
      language_code: languageCode,
      slug,
      title,
      excerpt: asNullableString(article.excerpt),
      tldr: asNullableString(article.tldr),
      content_json: contentJson,
      content_html: contentHtml,
      meta_title: asNullableString(article.meta_title),
      meta_description: asNullableString(article.meta_description),
      og_image_url: asNullableString(article.og_image_url),
      faq_json: Array.isArray(article.faq_json) ? article.faq_json : null,
      is_machine_translated: Boolean(article.is_machine_translated),
      updated_at: now,
    };
  });

  const { error: translationError } = await supabaseAdmin
    .from("blog_post_translations")
    .upsert(translationRows, { onConflict: "post_id,language_code" });
  if (translationError) throw new Error(translationError.message);

  await supabaseAdmin.from("blog_post_tags").delete().eq("post_id", postId);
  if (input.tags.length > 0) {
    const { error: tagsError } = await supabaseAdmin
      .from("blog_post_tags")
      .insert(input.tags.map((tag) => ({ post_id: postId, tag_id: tag.id })));
    if (tagsError) throw new Error(tagsError.message);
  }

  await supabaseAdmin.from("blog_post_recipes").delete().eq("post_id", postId);
  if (input.relatedRecipes.length > 0) {
    const { error: relatedError } = await supabaseAdmin.from("blog_post_recipes").insert(
      input.relatedRecipes.map((recipe, index) => ({
        post_id: postId,
        recipe_id: recipe.id,
        position: index + 1,
        label: recipe.label,
        note: recipe.note,
      }))
    );
    if (relatedError) throw new Error(relatedError.message);
  }

  const paths = new Set<string>(["/"]);
  const ruSlug = perLanguage[DEFAULT_LANGUAGE]?.slug;
  if (ruSlug) paths.add(`/${ruSlug}`);
  if (input.categorySlug) paths.add(`/category/${input.categorySlug}`);
  for (const tag of input.tags) paths.add(`/tag/${tag.slug}`);
  await revalidateBlogPaths(Array.from(paths));

  return {
    id: postId,
    languages: languageCodes,
    publicUrl: input.status === "published" && ruSlug ? `https://dishday.online/blog/${ruSlug}` : null,
  };
}

export interface RecipeCandidate {
  id: string;
  title: string;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  servings: number | null;
}

// Real recipes whose title overlaps with a free-text topic, ranked by word
// overlap. Used to ground an AI prompt in actual DB rows so it can only pick
// real recipe_id values instead of inventing plausible-sounding titles — and
// carries real prep/cook time + servings so the prompt can force the AI to
// quote ONE real time value everywhere instead of inventing its own number
// that then disagrees with the recipe card rendered from this same data.
export async function searchRecipeCandidates(topic: string, limit = 15): Promise<RecipeCandidate[]> {
  const words = topic
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9а-яё]/gi, ""))
    .filter((word) => word.length >= 3);
  if (words.length === 0) return [];

  const orFilter = words.map((word) => `title.ilike.%${word}%`).join(",");
  const { data, error } = await supabaseAdmin
    .from("recipes")
    .select("id, title, prep_time, cook_time, servings")
    .or(orFilter)
    .limit(limit * 3);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  const scored = data.map((row) => {
    const title = String(row.title).toLowerCase();
    const score = words.filter((word) => title.includes(word)).length;
    return {
      id: row.id as string,
      title: row.title as string,
      prepTimeMin: (row.prep_time as number) ?? null,
      cookTimeMin: (row.cook_time as number) ?? null,
      servings: (row.servings as number) ?? null,
      score,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ id, title, prepTimeMin, cookTimeMin, servings }) => ({ id, title, prepTimeMin, cookTimeMin, servings }));
}

export interface TaxonomyOption {
  slug: string;
  name: string;
}

// Real category/tag slugs + display names, so a generation prompt can tell
// the AI to reuse existing taxonomy instead of inventing near-duplicate slugs.
export async function listCategoryOptions(languageCode: string = DEFAULT_LANGUAGE): Promise<TaxonomyOption[]> {
  const { data, error } = await supabaseAdmin
    .from("blog_categories")
    .select("slug, translations:blog_category_translations(language_code, name)")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  return (data ?? []).map((category) => {
    const translations = (category.translations as Array<{ language_code: string; name: string }>) ?? [];
    const match = translations.find((t) => t.language_code === languageCode) ?? translations[0];
    return { slug: category.slug as string, name: match?.name ?? (category.slug as string) };
  });
}

export async function listTagOptions(languageCode: string = DEFAULT_LANGUAGE): Promise<TaxonomyOption[]> {
  const { data, error } = await supabaseAdmin
    .from("blog_tags")
    .select("slug, translations:blog_tag_translations(language_code, name)");
  if (error) throw new Error(error.message);

  return (data ?? []).map((tag) => {
    const translations = (tag.translations as Array<{ language_code: string; name: string }>) ?? [];
    const match = translations.find((t) => t.language_code === languageCode) ?? translations[0];
    return { slug: tag.slug as string, name: match?.name ?? (tag.slug as string) };
  });
}

export interface RecipeFactSheet {
  id: string;
  title: string;
  cuisine: string | null;
  difficulty: string | null;
  servings: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  ingredients: string[];
  instructions: string[];
}

// Real facts about a recipe, used to ground the AI generator so it never
// has to (and never should) invent ingredients, timing, or nutrition.
export async function getRecipeFactSheet(recipeId: string): Promise<RecipeFactSheet | null> {
  const { data: recipe } = await supabaseAdmin
    .from("recipes")
    .select("id, title, servings, prep_time, cook_time, difficulty, calories, protein, fat, carbs, cuisine:cuisines(name)")
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return null;

  const [{ data: ingredients }, { data: steps }] = await Promise.all([
    supabaseAdmin
      .from("recipe_ingredients_view")
      .select("name, amount, unit")
      .eq("recipe_id", recipeId)
      .order("order_index", { ascending: true }),
    supabaseAdmin.from("recipe_steps").select("text").eq("recipe_id", recipeId).order("order_index", { ascending: true }),
  ]);

  const cuisineRaw = recipe.cuisine as { name: string }[] | { name: string } | null;
  const cuisine = Array.isArray(cuisineRaw) ? cuisineRaw[0]?.name : cuisineRaw?.name;

  return {
    id: recipe.id as string,
    title: recipe.title as string,
    cuisine: cuisine ?? null,
    difficulty: (recipe.difficulty as string) ?? null,
    servings: (recipe.servings as number) ?? null,
    prepTimeMin: (recipe.prep_time as number) ?? null,
    cookTimeMin: (recipe.cook_time as number) ?? null,
    calories: (recipe.calories as number) ?? null,
    protein: (recipe.protein as number) ?? null,
    fat: (recipe.fat as number) ?? null,
    carbs: (recipe.carbs as number) ?? null,
    ingredients: ((ingredients ?? []) as Array<{ name: string | null; amount: string | number | null; unit: string | null }>)
      .map((i) => [i.amount, i.unit, i.name].filter(Boolean).join(" ").trim())
      .filter(Boolean),
    instructions: ((steps ?? []) as Array<{ text: string | null }>).map((s) => s.text).filter((t): t is string => Boolean(t)),
  };
}
