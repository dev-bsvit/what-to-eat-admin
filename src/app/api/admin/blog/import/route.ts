import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidateBlogPaths } from "@/lib/revalidateBlog";

const DEFAULT_LANGUAGE = "ru";
const VALID_STATUSES = new Set(["draft", "in_review", "scheduled", "published", "archived"]);
const VALID_SOURCES = new Set(["manual", "ai_generated", "ai_assisted"]);
const VALID_ARTICLE_TYPES = new Set(["guide", "recipe", "collection"]);

type JsonRecord = Record<string, unknown>;

interface ImportSection {
  type: "h2" | "h3" | "p" | "ul" | "ol" | "blockquote" | "image";
  text?: string;
  items?: string[];
  src?: string;
  alt?: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const text = asString(value);
  return text || null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isUuid(value: string | null | undefined) {
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

function normalizeSections(value: unknown): ImportSection[] {
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
  const contentJson = {
    type: "doc",
    content: [] as JsonRecord[],
  };

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

  return {
    content_json: contentJson,
    content_html: htmlParts.join("\n"),
  };
}

function renderArticleContent(article: JsonRecord) {
  const sections = normalizeSections(article.sections);
  const rendered = sections.length > 0 ? renderSections(sections) : null;
  const contentJson = isRecord(article.content_json) ? article.content_json : rendered?.content_json ?? { type: "doc", content: [] };
  const contentHtml = asString(article.content_html) || rendered?.content_html || null;
  return { contentJson, contentHtml };
}

// category.translations: { [language_code]: { name, description? } }
// Falls back to a single category.name/category.slug pair for the primary language.
async function ensureCategory(category: unknown, primaryLanguage: string) {
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
    .upsert(
      {
        slug,
        icon: asNullableString(category.icon),
        sort_order: asNumber(category.sort_order) ?? 0,
      },
      { onConflict: "slug" }
    )
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

// Note: blog_authors has no per-language columns yet — name/bio/title are
// stored once regardless of how many article languages are imported.
async function ensureAuthor(author: unknown) {
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

async function resolveRecipe(body: JsonRecord) {
  const recipe = isRecord(body.recipe) ? body.recipe : {};
  const recipeId = asString(body.recipe_id) || asString(recipe.id);
  if (isUuid(recipeId)) return recipeId;

  const recipeTitle = asString(body.recipe_title) || asString(recipe.title);
  if (!recipeTitle) return null;

  const { data, error } = await supabaseAdmin.from("recipes").select("id").ilike("title", recipeTitle).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? (data.id as string) : null;
}

async function resolveRelatedRecipes(value: unknown) {
  if (!Array.isArray(value)) return [];

  const recipes: Array<{ id: string; label: string | null; note: string | null }> = [];
  for (const rawRecipe of value) {
    const recipe = typeof rawRecipe === "string" ? { title: rawRecipe } : rawRecipe;
    if (!isRecord(recipe)) continue;

    const id = asString(recipe.id) || asString(recipe.recipe_id);
    let recipeId = isUuid(id) ? id : null;

    if (!recipeId) {
      const title = asString(recipe.title) || asString(recipe.recipe_title);
      if (!title) continue;
      const { data, error } = await supabaseAdmin.from("recipes").select("id").ilike("title", title).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      recipeId = data?.id ? (data.id as string) : null;
    }

    if (recipeId) {
      recipes.push({
        id: recipeId,
        label: asNullableString(recipe.label),
        note: asNullableString(recipe.note),
      });
    }
  }

  return recipes;
}

// tag.translations: { [language_code]: name }. Falls back to a single
// tag.name/tag.slug pair for the primary language.
async function ensureTags(tags: unknown, primaryLanguage: string) {
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
    const perLanguage: Record<string, { title: string; slug: string; article: JsonRecord }> = {};
    for (const languageCode of languageCodes) {
      const article = translationsInput[languageCode] as JsonRecord;
      const title = asString(article.title);
      const slug = slugify(asString(article.slug) || title);
      if (!title || !slug) {
        return NextResponse.json({ error: `translations.${languageCode}.title and .slug are required` }, { status: 400 });
      }
      perLanguage[languageCode] = { title, slug, article };
    }

    const recipeId = await resolveRecipe(body);
    const relatedRecipes = await resolveRelatedRecipes(body.related_recipes);
    if ((articleType === "recipe" || body.recipe_required === true) && !recipeId) {
      return NextResponse.json({ error: "Recipe was required but was not found by recipe_id or recipe_title" }, { status: 400 });
    }
    if (articleType === "collection" && relatedRecipes.length === 0) {
      return NextResponse.json({ error: "Collection articles require related_recipes with recipe_id or exact recipe_title" }, { status: 400 });
    }

    const category = await ensureCategory(body.category, primaryLanguage);
    const authorId = await ensureAuthor(body.author);
    const tags = await ensureTags(body.tags, primaryLanguage);

    const status = VALID_STATUSES.has(asString(body.status)) ? asString(body.status) : "draft";
    const source = VALID_SOURCES.has(asString(body.source)) ? asString(body.source) : "ai_assisted";
    const now = new Date().toISOString();

    // Resolve which post this import targets: explicit post_id, else an
    // existing post matched by any language's (slug, language_code), else new.
    let postId = isUuid(asString(body.post_id)) ? asString(body.post_id) : undefined;
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
      status,
      source,
      article_type: articleType,
      recipe_id: recipeId,
      category_id: category?.id ?? null,
      author_id: authorId,
      cover_image_url: asNullableString(body.cover_image_url),
      cover_image_alt: asNullableString(body.cover_image_alt ?? primaryArticle.cover_image_alt),
      reading_time_min: asNumber(body.reading_time_min),
    };

    if (postId) {
      const { data: existingPost } = await supabaseAdmin.from("blog_posts").select("published_at").eq("id", postId).single();
      const existingPublishedAt = (existingPost?.published_at as string | null) ?? null;
      const { error } = await supabaseAdmin
        .from("blog_posts")
        .update({
          ...postFields,
          published_at: status === "published" ? existingPublishedAt ?? now : null,
          updated_at: now,
        })
        .eq("id", postId);
      if (error) throw new Error(error.message);
    } else {
      const { data: post, error } = await supabaseAdmin
        .from("blog_posts")
        .insert({ ...postFields, published_at: status === "published" ? now : null })
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
        is_machine_translated: languageCode !== primaryLanguage && Boolean(body.machine_translated),
        updated_at: now,
      };
    });

    const { error: translationError } = await supabaseAdmin
      .from("blog_post_translations")
      .upsert(translationRows, { onConflict: "post_id,language_code" });
    if (translationError) throw new Error(translationError.message);

    await supabaseAdmin.from("blog_post_tags").delete().eq("post_id", postId);
    if (tags.length > 0) {
      const { error: tagsError } = await supabaseAdmin
        .from("blog_post_tags")
        .insert(tags.map((tag) => ({ post_id: postId, tag_id: tag.id })));
      if (tagsError) throw new Error(tagsError.message);
    }

    await supabaseAdmin.from("blog_post_recipes").delete().eq("post_id", postId);
    if (relatedRecipes.length > 0) {
      const { error: relatedError } = await supabaseAdmin.from("blog_post_recipes").insert(
        relatedRecipes.map((recipe, index) => ({
          post_id: postId,
          recipe_id: recipe.id,
          position: index + 1,
          label: recipe.label,
          note: recipe.note,
        }))
      );
      if (relatedError) throw new Error(relatedError.message);
    }

    // The public frontend only serves the "ru" locale today, so only its
    // path is worth busting — other-language slugs aren't routable yet.
    const paths = new Set<string>(["/"]);
    const ruSlug = perLanguage[DEFAULT_LANGUAGE]?.slug;
    if (ruSlug) paths.add(`/${ruSlug}`);
    if (category?.slug) paths.add(`/category/${category.slug}`);
    for (const tag of tags) paths.add(`/tag/${tag.slug}`);
    await revalidateBlogPaths(Array.from(paths));

    return NextResponse.json({
      ok: true,
      id: postId,
      status,
      article_type: articleType,
      languages: languageCodes,
      public_url: status === "published" && ruSlug ? `https://dishday.online/blog/${ruSlug}` : null,
      recipe_id: recipeId,
      related_recipe_ids: relatedRecipes.map((recipe) => recipe.id),
      category_id: category?.id ?? null,
      tag_ids: tags.map((tag) => tag.id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
