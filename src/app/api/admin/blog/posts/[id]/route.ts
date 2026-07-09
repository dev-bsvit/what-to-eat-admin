import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidateBlogPaths } from "@/lib/revalidateBlog";
import { slugify } from "@/lib/slug";

interface RevalidatePostShape {
  category?: { slug: string }[] | { slug: string } | null;
  translations?: Array<{ slug: string; language_code: string }> | null;
  tags?: Array<{ tag: { slug: string }[] | { slug: string } | null }> | null;
}

// Every page is locale-prefixed (/ru/..., /en/...) — category_id/tags apply
// to the whole post regardless of which language was just edited, so this
// revalidates every language the post actually has a translation for, not
// just the one that was saved.
function pathsForPost(post: RevalidatePostShape | null | undefined) {
  const paths = new Set<string>();

  const rawCategory = post?.category;
  const categorySlug = Array.isArray(rawCategory) ? rawCategory[0]?.slug : rawCategory?.slug;

  const tagSlugs = (post?.tags ?? [])
    .map((item) => (Array.isArray(item.tag) ? item.tag[0]?.slug : item.tag?.slug))
    .filter((slug): slug is string => Boolean(slug));

  for (const translation of post?.translations ?? []) {
    const lang = translation.language_code;
    paths.add(`/${lang}`);
    if (translation.slug) paths.add(`/${lang}/${translation.slug}`);
    if (categorySlug) paths.add(`/${lang}/category/${categorySlug}`);
    for (const tagSlug of tagSlugs) paths.add(`/${lang}/tag/${tagSlug}`);
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
    "cover_image_alt",
    "og_image_url",
    "faq_json",
    "recipe_json",
    "recipes_json",
  ] as const) {
    if (key in body) translationFields[key] = body[key];
  }

  if (typeof translationFields.slug === "string") {
    translationFields.slug = slugify(translationFields.slug) || slugify(String(body.title || ""));

    const { data: current } = await supabaseAdmin
      .from("blog_post_translations")
      .select("slug, previous_slugs")
      .eq("post_id", id)
      .eq("language_code", languageCode)
      .maybeSingle();

    if (current?.slug && current.slug !== translationFields.slug) {
      const history = new Set<string>((current.previous_slugs as string[]) ?? []);
      history.add(current.slug);
      history.delete(translationFields.slug as string);
      translationFields.previous_slugs = Array.from(history);
    }
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

  await revalidateBlogPaths(pathsForPost(fresh as RevalidatePostShape | null));

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
