import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { slugify } from "@/lib/slug";

// PATCH /api/admin/blog/authors/:id — { name?, slug?, title?, bio?, avatar_url?, profile_url?, same_as? }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const fields: Record<string, unknown> = {};
  for (const key of ["name", "title", "bio", "avatar_url", "profile_url"] as const) {
    if (key in body) fields[key] = body[key] || null;
  }
  if (Array.isArray(body.same_as)) fields.same_as = body.same_as;
  if (typeof body.slug === "string" && body.slug.trim()) {
    const slug = slugify(body.slug);
    if (slug) fields.slug = slug;
  }

  if (Object.keys(fields).length === 0) return NextResponse.json({ ok: true });

  const { error } = await supabaseAdmin.from("blog_authors").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
