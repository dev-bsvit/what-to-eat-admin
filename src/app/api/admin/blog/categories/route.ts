import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/admin/blog/categories?language_code=ru
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get("language_code") || "ru";

  const { data, error } = await supabaseAdmin
    .from("blog_categories")
    .select("id, slug, sort_order, icon, translations:blog_category_translations(language_code, name, description)")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const categories = (data ?? []).map((c) => {
    const translations = (c.translations ?? []) as Array<{ language_code: string; name: string; description: string | null }>;
    const translation = translations.find((t) => t.language_code === languageCode) ?? translations[0] ?? null;
    const translationsByLanguage = Object.fromEntries(translations.map((t) => [t.language_code, { name: t.name, description: t.description }]));
    return { id: c.id, slug: c.slug, icon: c.icon, name: translation?.name ?? c.slug, translations: translationsByLanguage };
  });

  return NextResponse.json({ categories });
}

// POST /api/admin/blog/categories — { slug, icon?, translations: { [language_code]: { name, description? } } }
export async function POST(request: Request) {
  const body = await request.json();
  const slug: string = (body.slug || "").trim();
  const translations: Record<string, { name: string; description?: string }> = body.translations || {};

  if (!slug || Object.keys(translations).length === 0) {
    return NextResponse.json({ error: "slug and at least one translation are required" }, { status: 400 });
  }

  const { data: category, error } = await supabaseAdmin
    .from("blog_categories")
    .insert({ slug, icon: body.icon || null, sort_order: body.sort_order ?? 0 })
    .select("id")
    .single();

  if (error || !category) {
    return NextResponse.json({ error: error?.message || "Failed to create category" }, { status: 400 });
  }

  const rows = Object.entries(translations).map(([language_code, t]) => ({
    category_id: category.id,
    language_code,
    name: t.name,
    description: t.description || null,
  }));

  const { error: translationsError } = await supabaseAdmin.from("blog_category_translations").insert(rows);
  if (translationsError) {
    await supabaseAdmin.from("blog_categories").delete().eq("id", category.id);
    return NextResponse.json({ error: translationsError.message }, { status: 400 });
  }

  return NextResponse.json({ id: category.id }, { status: 201 });
}
