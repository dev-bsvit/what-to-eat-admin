import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidateBlogPaths } from "@/lib/revalidateBlog";
import { slugify } from "@/lib/slug";

// PATCH /api/admin/blog/categories/:id
// Body: { slug?, icon?, sort_order?, translations?: { [language_code]: { name, description? } } }
// A slug change appends the old slug to previous_slugs so the public
// frontend can 308-redirect old category URLs instead of 404ing.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const { data: current, error: currentError } = await supabaseAdmin
    .from("blog_categories")
    .select("slug, previous_slugs")
    .eq("id", id)
    .maybeSingle();
  if (currentError || !current) return NextResponse.json({ error: currentError?.message || "Category not found" }, { status: 404 });

  const categoryFields: Record<string, unknown> = {};
  if (typeof body.icon === "string" || body.icon === null) categoryFields.icon = body.icon;
  if (typeof body.sort_order === "number") categoryFields.sort_order = body.sort_order;

  if (typeof body.slug === "string" && body.slug.trim()) {
    const newSlug = slugify(body.slug);
    if (newSlug && newSlug !== current.slug) {
      categoryFields.slug = newSlug;
      const history = new Set<string>((current.previous_slugs as string[]) ?? []);
      history.add(current.slug);
      history.delete(newSlug);
      categoryFields.previous_slugs = Array.from(history);
    }
  }

  if (Object.keys(categoryFields).length > 0) {
    const { error } = await supabaseAdmin.from("blog_categories").update(categoryFields).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (body.translations && typeof body.translations === "object") {
    const rows = Object.entries(body.translations as Record<string, { name?: string; description?: string }>)
      .filter(([, t]) => t?.name)
      .map(([language_code, t]) => ({
        category_id: id,
        language_code,
        name: t.name,
        description: t.description || null,
      }));
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("blog_category_translations").upsert(rows, { onConflict: "category_id,language_code" });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const oldSlug = current.slug;
  const newSlug = (categoryFields.slug as string | undefined) ?? oldSlug;
  const paths = new Set<string>();
  for (const lang of ["ru", "en", "de", "it", "fr", "es", "pt-BR", "uk"]) {
    paths.add(`/${lang}/category/${oldSlug}`);
    paths.add(`/${lang}/category/${newSlug}`);
  }
  await revalidateBlogPaths(Array.from(paths));

  return NextResponse.json({ ok: true, slug: newSlug });
}
