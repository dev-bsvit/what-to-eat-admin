import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidateBlogPaths } from "@/lib/revalidateBlog";

interface RevalidatePostShape {
  category?: { slug: string }[] | { slug: string } | null;
  translations?: Array<{ slug: string; language_code: string }> | null;
  tags?: Array<{ tag: { slug: string }[] | { slug: string } | null }> | null;
}

function pathsForPost(post: RevalidatePostShape | null | undefined) {
  const paths = new Set<string>(["/"]);
  const slug = post?.translations?.find((t) => t.language_code === "ru")?.slug ?? post?.translations?.[0]?.slug;
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

async function getPostRevalidationShape(id: string) {
  const { data } = await supabaseAdmin
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

  return data as RevalidatePostShape | null;
}

// PUT /api/admin/blog/posts/:id/tags — { tag_ids: string[] }
// Replaces the full set of tags on a post.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const rawTagIds: unknown[] = Array.isArray(body.tag_ids) ? body.tag_ids : [];
  const tagIds = Array.from(
    new Set(rawTagIds.filter((tagId): tagId is string => typeof tagId === "string" && tagId.length > 0))
  );
  const before = await getPostRevalidationShape(id);

  const { error: deleteError } = await supabaseAdmin.from("blog_post_tags").delete().eq("post_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  if (tagIds.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("blog_post_tags")
      .insert(tagIds.map((tag_id) => ({ post_id: id, tag_id })));
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const after = await getPostRevalidationShape(id);
  await revalidateBlogPaths(Array.from(new Set([...pathsForPost(before), ...pathsForPost(after)])));
  return NextResponse.json({ ok: true });
}
