import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_LANGUAGE = "ru";

// GET /api/admin/blog/posts?status=draft&category_id=...&language_code=ru&search=...
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const categoryId = searchParams.get("category_id");
  const languageCode = searchParams.get("language_code") || DEFAULT_LANGUAGE;
  const search = searchParams.get("search");

  let query = supabaseAdmin
    .from("blog_posts")
    .select(
      `
      id, status, source, recipe_id, category_id, cover_image_url,
      reading_time_min, view_count, published_at, scheduled_at,
      created_at, updated_at,
      category:blog_categories(id, slug),
      translations:blog_post_translations(post_id, language_code, slug, title, excerpt, is_machine_translated)
    `
    )
    .order("updated_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Приводим к плоскому виду: заголовок/slug в нужном языке (fallback на первый доступный перевод)
  let posts = (data ?? []).map((post) => {
    const translations = (post.translations ?? []) as Array<{
      post_id: string;
      language_code: string;
      slug: string;
      title: string;
      excerpt: string | null;
      is_machine_translated: boolean;
    }>;
    const translation =
      translations.find((t) => t.language_code === languageCode) ?? translations[0] ?? null;

    return {
      ...post,
      title: translation?.title ?? "(без перевода)",
      slug: translation?.slug ?? null,
      excerpt: translation?.excerpt ?? null,
      available_languages: translations.map((t) => t.language_code),
    };
  });

  if (search) {
    const needle = search.toLowerCase();
    posts = posts.filter((p) => (p.title || "").toLowerCase().includes(needle));
  }

  return NextResponse.json({ posts });
}

// POST /api/admin/blog/posts — создать черновик вручную
export async function POST(request: Request) {
  const body = await request.json();
  const languageCode: string = body.language_code || DEFAULT_LANGUAGE;
  const title: string = (body.title || "").trim();
  const slug: string = (body.slug || "").trim();

  if (!title || !slug) {
    return NextResponse.json({ error: "title and slug are required" }, { status: 400 });
  }

  const { data: post, error: postError } = await supabaseAdmin
    .from("blog_posts")
    .insert({
      status: "draft",
      source: "manual",
      category_id: body.category_id || null,
      recipe_id: body.recipe_id || null,
      cover_image_url: body.cover_image_url || null,
      cover_image_alt: body.cover_image_alt || null,
    })
    .select("id")
    .single();

  if (postError || !post) {
    return NextResponse.json({ error: postError?.message || "Failed to create post" }, { status: 400 });
  }

  const { error: translationError } = await supabaseAdmin.from("blog_post_translations").insert({
    post_id: post.id,
    language_code: languageCode,
    slug,
    title,
    excerpt: body.excerpt || null,
    content_json: body.content_json || {},
    content_html: body.content_html || null,
    meta_title: body.meta_title || null,
    meta_description: body.meta_description || null,
  });

  if (translationError) {
    // Откатываем созданный пост, чтобы не оставлять статью без перевода
    await supabaseAdmin.from("blog_posts").delete().eq("id", post.id);
    return NextResponse.json({ error: translationError.message }, { status: 400 });
  }

  return NextResponse.json({ id: post.id }, { status: 201 });
}
