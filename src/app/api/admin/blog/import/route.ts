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

async function ensureCategory(category: unknown, languageCode: string) {
  if (!isRecord(category)) return null;
  const name = asString(category.name);
  const slug = slugify(asString(category.slug) || name);
  if (!slug || !name) return null;

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

  const { error: translationError } = await supabaseAdmin.from("blog_category_translations").upsert(
    {
      category_id: data.id,
      language_code: languageCode,
      name,
      description: asNullableString(category.description),
    },
    { onConflict: "category_id,language_code" }
  );
  if (translationError) throw new Error(translationError.message);

  return data as { id: string; slug: string };
}

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

async function resolveRecipe(body: JsonRecord, article: JsonRecord) {
  const recipe = isRecord(body.recipe) ? body.recipe : {};
  const articleRecipe = isRecord(article.recipe) ? article.recipe : {};
  const recipeId = asString(body.recipe_id) || asString(article.recipe_id) || asString(recipe.id) || asString(articleRecipe.id);
  if (isUuid(recipeId)) return recipeId;

  const recipeTitle = asString(body.recipe_title) || asString(article.recipe_title) || asString(recipe.title) || asString(articleRecipe.title);
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

async function ensureTags(tags: unknown, languageCode: string) {
  if (!Array.isArray(tags)) return [];

  const result: Array<{ id: string; slug: string }> = [];
  for (const rawTag of tags) {
    const tag = typeof rawTag === "string" ? { slug: rawTag, name: rawTag } : rawTag;
    if (!isRecord(tag)) continue;

    const name = asString(tag.name) || asString(tag.slug);
    const slug = slugify(asString(tag.slug) || name);
    if (!slug || !name) continue;

    const { data, error } = await supabaseAdmin.from("blog_tags").upsert({ slug }, { onConflict: "slug" }).select("id, slug").single();
    if (error || !data) throw new Error(error?.message || "Failed to create tag");

    const translations = isRecord(tag.translations) ? tag.translations : { [languageCode]: name };
    const rows = Object.entries(translations)
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: "JSON object is required" }, { status: 400 });

    const article = isRecord(body.article) ? body.article : isRecord(body.post) ? body.post : body;
    const languageCode = asString(body.language_code) || asString(article.language_code) || DEFAULT_LANGUAGE;
    const title = asString(article.title);
    const slug = slugify(asString(article.slug) || title);
    const articleTypeRaw = asString(body.article_type) || asString(article.article_type);
    const articleType = VALID_ARTICLE_TYPES.has(articleTypeRaw) ? articleTypeRaw : "guide";

    if (!title || !slug) {
      return NextResponse.json({ error: "article.title and article.slug are required" }, { status: 400 });
    }

    const recipeId = await resolveRecipe(body, article);
    const relatedRecipes = await resolveRelatedRecipes(body.related_recipes ?? article.related_recipes);
    if ((articleType === "recipe" || body.recipe_required === true || article.recipe_required === true) && !recipeId) {
      return NextResponse.json({ error: "Recipe was required but was not found by recipe_id or recipe_title" }, { status: 400 });
    }
    if (articleType === "collection" && relatedRecipes.length === 0) {
      return NextResponse.json({ error: "Collection articles require related_recipes with recipe_id or exact recipe_title" }, { status: 400 });
    }

    const category = await ensureCategory(body.category ?? article.category, languageCode);
    const authorId = await ensureAuthor(body.author ?? article.author);
    const tags = await ensureTags(body.tags ?? article.tags, languageCode);

    const sections = normalizeSections(article.sections);
    const rendered = sections.length > 0 ? renderSections(sections) : null;
    const contentJson = isRecord(article.content_json) ? article.content_json : rendered?.content_json ?? { type: "doc", content: [] };
    const contentHtml = asString(article.content_html) || rendered?.content_html || null;

    const status = VALID_STATUSES.has(asString(body.status)) ? asString(body.status) : "draft";
    const source = VALID_SOURCES.has(asString(body.source)) ? asString(body.source) : "ai_assisted";
    const now = new Date().toISOString();

    const { data: existingTranslation } = await supabaseAdmin
      .from("blog_post_translations")
      .select("post_id")
      .eq("language_code", languageCode)
      .eq("slug", slug)
      .maybeSingle();

    let postId = existingTranslation?.post_id as string | undefined;
    let existingPublishedAt: string | null = null;

    if (postId) {
      const { data: existingPost } = await supabaseAdmin.from("blog_posts").select("published_at").eq("id", postId).single();
      existingPublishedAt = (existingPost?.published_at as string | null) ?? null;
      const { error } = await supabaseAdmin
        .from("blog_posts")
        .update({
          status,
          source,
          article_type: articleType,
          recipe_id: recipeId,
          category_id: category?.id ?? null,
          author_id: authorId,
          cover_image_url: asNullableString(body.cover_image_url ?? article.cover_image_url),
          cover_image_alt: asNullableString(body.cover_image_alt ?? article.cover_image_alt),
          reading_time_min: asNumber(body.reading_time_min ?? article.reading_time_min),
          published_at: status === "published" ? existingPublishedAt ?? now : null,
          updated_at: now,
        })
        .eq("id", postId);
      if (error) throw new Error(error.message);
    } else {
      const { data: post, error } = await supabaseAdmin
        .from("blog_posts")
        .insert({
          status,
          source,
          article_type: articleType,
          recipe_id: recipeId,
          category_id: category?.id ?? null,
          author_id: authorId,
          cover_image_url: asNullableString(body.cover_image_url ?? article.cover_image_url),
          cover_image_alt: asNullableString(body.cover_image_alt ?? article.cover_image_alt),
          reading_time_min: asNumber(body.reading_time_min ?? article.reading_time_min),
          published_at: status === "published" ? now : null,
        })
        .select("id")
        .single();
      if (error || !post) throw new Error(error?.message || "Failed to create post");
      postId = post.id as string;
    }
    if (!postId) throw new Error("Failed to resolve post id");

    const { error: translationError } = await supabaseAdmin.from("blog_post_translations").upsert(
      {
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
        og_image_url: asNullableString(article.og_image_url ?? body.og_image_url),
        faq_json: Array.isArray(article.faq_json) ? article.faq_json : null,
        updated_at: now,
      },
      { onConflict: "post_id,language_code" }
    );
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

    const paths = new Set<string>(["/", `/${slug}`]);
    if (category?.slug) paths.add(`/category/${category.slug}`);
    for (const tag of tags) paths.add(`/tag/${tag.slug}`);
    await revalidateBlogPaths(Array.from(paths));

    return NextResponse.json({
      ok: true,
      id: postId,
      slug,
      status,
      article_type: articleType,
      public_url: status === "published" ? `https://dishday.online/blog/${slug}` : null,
      recipe_id: recipeId,
      related_recipe_ids: relatedRecipes.map((recipe) => recipe.id),
      category_id: category?.id ?? null,
      tag_ids: tags.map((tag) => tag.id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
}
