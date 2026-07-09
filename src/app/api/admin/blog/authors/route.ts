import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { slugify } from "@/lib/slug";

// GET /api/admin/blog/authors
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("blog_authors")
    .select("id, slug, name, title, bio, avatar_url, profile_url, same_as, translations:blog_author_translations(language_code, title, bio)")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ authors: data ?? [] });
}

// POST /api/admin/blog/authors — { name, slug?, title?, bio?, avatar_url?, profile_url?, same_as? }
export async function POST(request: Request) {
  const body = await request.json();
  const name: string = (body.name || "").trim();
  const slug = slugify(body.slug || "") || slugify(name);

  if (!name || !slug) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("blog_authors")
    .insert({
      name,
      slug,
      title: body.title || null,
      bio: body.bio || null,
      avatar_url: body.avatar_url || null,
      profile_url: body.profile_url || null,
      same_as: Array.isArray(body.same_as) ? body.same_as : [],
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Failed to create author" }, { status: 400 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
