import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidateBlogPaths } from "@/lib/revalidateBlog";

interface RevalidatePostShape {
  category?: { slug: string }[] | { slug: string } | null;
  translations?: Array<{ slug: string; language_code: string }> | null;
  tags?: Array<{ tag: { slug: string }[] | { slug: string } | null }> | null;
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

function pathsForPost(post: RevalidatePostShape | null | undefined, languageCode = "ru") {
  const paths = new Set<string>(["/"]);
  const slug = post?.translations?.find((t) => t.language_code === languageCode)?.slug ?? post?.translations?.[0]?.slug;
  if (slug) paths.add(`/${slug}`);

  const rawCategory = post?.category;
  const categorySlug = Array.isArray(rawCategory) ? rawCategory[0]?.slug : rawCategory?.slug;
  if (categorySlug) paths.add(`/category/${categorySlug}`);

  for (const item of post?.tags ?? []) {
    const rawTag = item.tag;
    const tagSlug = Array.isArray(rawTag) ? rawTag[0]?.slug : rawTag?.slug;
    if (tagSlug) paths.add(`/tag/${tagSlug}`);
  }

  return Array.from(paths);
}

// GET /api/admin/blog/posts/:id — вся статья со всеми переводами
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: post, error } = await supabaseAdmin
    .from("blog_posts")
    .select(
      `
      *,
      category:blog_categories(id, slug),
      translations:blog_post_translations(*),
      tags:blog_post_tags(tag_id)
    `
    )
    .eq("id", id)
    .single();

  if (error || !post) {
    return NextResponse.json({ error: error?.message || "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ post });
}

// PATCH /api/admin/blog/posts/:id
// Body: { language_code, title?, slug?, excerpt?, content_json?, content_html?,
//         meta_title?, meta_description?, category_id?, cover_image_url?, cover_image_alt?, status? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const languageCode: string = body.language_code || "ru";

  const postFields: Record<string, unknown> = {};
  for (const key of ["category_id", "author_id", "recipe_id", "cover_image_url", "cover_image_alt", "status"] as const) {
    if (key in body) postFields[key] = body[key];
  }

  if (body.status === "published") {
    postFields.published_at = new Date().toISOString();
  }

  if (Object.keys(postFields).length > 0) {
    postFields.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("blog_posts").update(postFields).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const translationFields: Record<string, unknown> = {};
  for (const key of [
    "slug",
    "title",
    "excerpt",
    "tldr",
    "content_json",
    "content_html",
    "meta_title",
    "meta_description",
    "og_image_url",
    "faq_json",
  ] as const) {
    if (key in body) translationFields[key] = body[key];
  }

  if (typeof translationFields.slug === "string") {
    translationFields.slug = slugify(translationFields.slug) || slugify(String(body.title || ""));
  }

  if (Object.keys(translationFields).length > 0) {
    translationFields.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("blog_post_translations")
      .update(translationFields)
      .eq("post_id", id)
      .eq("language_code", languageCode);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: fresh } = await supabaseAdmin
    .from("blog_posts")
    .select(
      `
      category:blog_categories(slug),
      translations:blog_post_translations(slug, language_code),
      tags:blog_post_tags(tag:blog_tags(slug))
      `
    )
    .eq("id", id)
    .single();

  await revalidateBlogPaths(pathsForPost(fresh as RevalidatePostShape | null, languageCode));

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/blog/posts/:id
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { data: existing } = await supabaseAdmin
    .from("blog_posts")
    .select(
      `
      category:blog_categories(slug),
      translations:blog_post_translations(slug, language_code),
      tags:blog_post_tags(tag:blog_tags(slug))
      `
    )
    .eq("id", id)
    .single();

  const { error } = await supabaseAdmin.from("blog_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await revalidateBlogPaths(pathsForPost(existing as RevalidatePostShape | null));
  return NextResponse.json({ ok: true });
}
