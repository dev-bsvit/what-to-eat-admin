-- TL;DR field for GEO (AI answer-box friendliness) + tags wiring.
-- Run in Supabase Dashboard → SQL Editor.

ALTER TABLE blog_post_translations ADD COLUMN IF NOT EXISTS tldr text;

COMMENT ON COLUMN blog_post_translations.tldr IS 'Short (2-3 sentence) direct-answer summary shown at the top of the article — the block most likely to be lifted verbatim into an AI answer box.';

-- blog_tags / blog_post_tags already exist from migration 006 — this file
-- only adds the language_code index needed for tag archive pages.
CREATE INDEX IF NOT EXISTS idx_blog_tag_translations_slug_lookup
  ON blog_tag_translations(language_code);
