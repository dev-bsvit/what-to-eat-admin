import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidateBlogPaths } from "@/lib/revalidateBlog";

// GET /api/admin/blog/tags?language_code=ru
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get("language_code") || "ru";

  const { data, error } = await supabaseAdmin
    .from("blog_tags")
    .select("id, slug, translations:blog_tag_translations(language_code, name)")
    .order("slug", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const tags = (data ?? []).map((t) => {
    const translations = (t.translations ?? []) as Array<{ language_code: string; name: string }>;
    const translation = translations.find((tr) => tr.language_code === languageCode) ?? translations[0] ?? null;
    return { id: t.id, slug: t.slug, name: translation?.name ?? t.slug };
  });

  return NextResponse.json({ tags });
}

// POST /api/admin/blog/tags — { slug, translations: { [language_code]: name } }
// Идемпотентно: если тег с таким slug уже есть — возвращает существующий id.
export async function POST(request: Request) {
  const body = await request.json();
  const slug: string = (body.slug || "").trim();
  const translations: Record<string, string> = body.translations || {};

  if (!slug || Object.keys(translations).length === 0) {
    return NextResponse.json({ error: "slug and at least one translation are required" }, { status: 400 });
  }

  const { data: tag, error } = await supabaseAdmin
    .from("blog_tags")
    .upsert({ slug }, { onConflict: "slug" })
    .select("id")
    .single();

  if (error || !tag) {
    return NextResponse.json({ error: error?.message || "Failed to create tag" }, { status: 400 });
  }

  const rows = Object.entries(translations).map(([language_code, name]) => ({
    tag_id: tag.id,
    language_code,
    name,
  }));

  const { error: translationsError } = await supabaseAdmin
    .from("blog_tag_translations")
    .upsert(rows, { onConflict: "tag_id,language_code" });

  if (translationsError) {
    return NextResponse.json({ error: translationsError.message }, { status: 400 });
  }

  await revalidateBlogPaths(["/"]);
  return NextResponse.json({ id: tag.id }, { status: 201 });
}
