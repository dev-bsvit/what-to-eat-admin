import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  for (const key of ["category_id", "recipe_id", "cover_image_url", "cover_image_alt", "status"] as const) {
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
    "content_json",
    "content_html",
    "meta_title",
    "meta_description",
    "og_image_url",
    "faq_json",
  ] as const) {
    if (key in body) translationFields[key] = body[key];
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

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/blog/posts/:id
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from("blog_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
