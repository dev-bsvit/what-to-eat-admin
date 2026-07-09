-- Same idea as migration 010, for categories: tracks every slug a category
-- has ever had so the public frontend can 308-redirect an old category URL
-- to the current one instead of 404ing when a category is renamed (e.g.
-- podborki -> collections). Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE blog_categories
  ADD COLUMN IF NOT EXISTS previous_slugs text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN blog_categories.previous_slugs IS
  'Slugs this category used to have, oldest first. Appended to (not overwritten) whenever slug changes, via PATCH /api/admin/blog/categories/:id.';
