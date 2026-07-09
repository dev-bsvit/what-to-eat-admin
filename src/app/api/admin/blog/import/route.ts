import { NextResponse } from "next/server";
import {
  DEFAULT_LANGUAGE,
  VALID_ARTICLE_TYPES,
  VALID_SOURCES,
  VALID_STATUSES,
  asNullableString,
  asNumber,
  asString,
  ensureAuthor,
  ensureCategory,
  ensureTags,
  isRecord,
  isUuid,
  normalizeRecipeJson,
  normalizeRecipeList,
  resolveRecipeByTitleOrId,
  resolveRelatedRecipes,
  slugify,
  upsertBlogPost,
  type JsonRecord,
} from "@/lib/blogContent";

// POST /api/admin/blog/import
// Body shape (see /blog/import in the admin UI for the full prompt + example):
// {
//   status, source, article_type, cover_image_url, cover_image_alt, reading_time_min,
//   category: { slug, translations: { ru: {name, description}, en: {...} } },
//   author: { name, title, bio, avatar_url, profile_url, same_as } | { id },
//   tags: [{ slug, translations: { ru: "...", en: "..." } }],
//   recipe_title | recipe_id,            // article_type "recipe"
//   related_recipes: [...],              // article_type "collection"
//   translations: {
//     ru: { slug, title, excerpt, tldr, meta_title, meta_description, cover_image_alt,
//           og_image_url, sections: [...], faq_json: [...] },
//     en: { ... same shape ... },
//     ...
//   }
// }
// Legacy single-language shape ({ language_code, article: {...} }) is still
// accepted and normalized into translations[language_code].
//
// Recipe titles that don't match exactly fall back to a fuzzy word-overlap
// search (see resolveRelatedRecipes/resolveRecipeByTitleOrId in blogContent.ts)
// instead of failing the whole import — any fuzzy resolutions or unresolved
// titles are returned in `warnings` rather than blocking the save.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: "JSON object is required" }, { status: 400 });

    const legacyArticle = isRecord(body.article) ? body.article : isRecord(body.post) ? body.post : null;
    const translationsInput: Record<string, unknown> = isRecord(body.translations)
      ? (body.translations as Record<string, unknown>)
      : legacyArticle
        ? { [asString(body.language_code) || DEFAULT_LANGUAGE]: legacyArticle }
        : {};

    const languageCodes = Object.keys(translationsInput).filter((code) => isRecord(translationsInput[code]));
    if (languageCodes.length === 0) {
      return NextResponse.json({ error: "translations object with at least one language is required" }, { status: 400 });
    }

    const primaryLanguage = languageCodes.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : languageCodes[0];
    const primaryArticle = translationsInput[primaryLanguage] as JsonRecord;

    const articleTypeRaw = asString(body.article_type);
    const articleType = VALID_ARTICLE_TYPES.has(articleTypeRaw) ? articleTypeRaw : "guide";

    // Validate every language has a title/slug before writing anything.
    for (const languageCode of languageCodes) {
      const article = translationsInput[languageCode] as JsonRecord;
      const title = asString(article.title);
      const slug = slugify(asString(article.slug) || title);
      if (!title || !slug) {
        return NextResponse.json({ error: `translations.${languageCode}.title and .slug are required` }, { status: 400 });
      }
    }

    const warnings: string[] = [];

    const recipe = isRecord(body.recipe) ? body.recipe : {};
    const recipeMatch = await resolveRecipeByTitleOrId(body.recipe_id ?? recipe.id, body.recipe_title ?? recipe.title);
    if (recipeMatch?.matchedTitle) {
      warnings.push(`Рецепт "${asString(body.recipe_title) || asString(recipe.title)}" не найден точно — использован ближайший: "${recipeMatch.matchedTitle}".`);
    }
    const recipeId = recipeMatch?.id ?? null;

    const { recipes: relatedRecipes, warnings: relatedWarnings } = await resolveRelatedRecipes(body.related_recipes);
    warnings.push(...relatedWarnings);

    // A "recipe" article can be satisfied either by a linked recipe_id or by
    // a translation carrying its own recipe_json (see normalizeRecipeJson) —
    // both give the same recipe-facts card + Recipe JSON-LD on the frontend.
    const hasInlineRecipe = languageCodes.some((code) => normalizeRecipeJson((translationsInput[code] as JsonRecord).recipe) !== null);
    if ((articleType === "recipe" || body.recipe_required === true) && !recipeId && !hasInlineRecipe) {
      return NextResponse.json(
        { error: "Recipe was required but was not found by recipe_id/recipe_title, and no translation had a recipe object" },
        { status: 400 }
      );
    }
    // A "collection" article can be satisfied either by real related_recipes
    // (DB-linked, lightweight cards) or by a translation carrying its own
    // recipes_json array (full ingredients/steps per recipe, see
    // normalizeRecipeList) — same idea as the "recipe" type's fallback above.
    const hasInlineRecipes = languageCodes.some((code) => normalizeRecipeList((translationsInput[code] as JsonRecord).recipes).length > 0);
    if (articleType === "collection" && relatedRecipes.length === 0 && !hasInlineRecipes) {
      return NextResponse.json(
        {
          error:
            "Collection articles require related_recipes with recipe_id/recipe_title, or a translation with a recipes array",
        },
        { status: 400 }
      );
    }

    const category = await ensureCategory(body.category, primaryLanguage);
    const authorId = await ensureAuthor(body.author);
    const tags = await ensureTags(body.tags, primaryLanguage);

    const status = VALID_STATUSES.has(asString(body.status)) ? asString(body.status) : "draft";
    const source = VALID_SOURCES.has(asString(body.source)) ? asString(body.source) : "ai_assisted";

    const postId = isUuid(asString(body.post_id)) ? asString(body.post_id) : undefined;

    const result = await upsertBlogPost({
      postId,
      status,
      source,
      articleType,
      recipeId,
      categoryId: category?.id ?? null,
      categorySlug: category?.slug ?? null,
      authorId,
      coverImageUrl: asNullableString(body.cover_image_url),
      coverImageAlt: asNullableString(body.cover_image_alt ?? primaryArticle.cover_image_alt),
      readingTimeMin: asNumber(body.reading_time_min),
      tags,
      relatedRecipes,
      translations: translationsInput as Record<string, JsonRecord>,
    });

    return NextResponse.json({
      ok: true,
      id: result.id,
      status,
      article_type: articleType,
      languages: result.languages,
      public_url: result.publicUrl,
      recipe_id: recipeId,
      related_recipe_ids: relatedRecipes.map((r) => r.id),
      category_id: category?.id ?? null,
      tag_ids: tags.map((tag) => tag.id),
      warnings,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
