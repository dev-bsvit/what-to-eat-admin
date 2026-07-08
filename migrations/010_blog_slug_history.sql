-- Tracks every slug a translation has ever had, so the public frontend can
-- 301-redirect an old URL to the current one instead of 404ing whenever an
-- editor renames a slug (e.g. migrating Cyrillic slugs to the transliterated
-- standard). Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE blog_post_translations
  ADD COLUMN IF NOT EXISTS previous_slugs text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN blog_post_translations.previous_slugs IS
  'Slugs this translation used to have, oldest first. Appended to (not overwritten) whenever slug changes, via the PATCH /api/admin/blog/posts/:id route.';
