-- cover_image_alt was only ever stored once per post (on blog_posts), even
-- though the import JSON already asks for it per translation
-- (translations.<lang>.cover_image_alt) — the per-language value was
-- silently discarded except as a one-time fallback for the primary
-- language, which is why a Ukrainian page could show Russian alt text.
-- Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE blog_post_translations ADD COLUMN IF NOT EXISTS cover_image_alt text;

COMMENT ON COLUMN blog_post_translations.cover_image_alt IS
  'Per-language alt text for the post cover image. Falls back to blog_posts.cover_image_alt (shared, legacy) if null.';
