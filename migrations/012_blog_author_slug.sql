-- Gives authors a real public bio page (/[locale]/author/[slug]) instead of
-- only an external social link — needed for E-E-A-T and internal linking.
-- Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE blog_authors ADD COLUMN IF NOT EXISTS slug text;

UPDATE blog_authors SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'))
WHERE slug IS NULL;

ALTER TABLE blog_authors ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_authors_slug ON blog_authors(slug);

COMMENT ON COLUMN blog_authors.slug IS 'URL slug for the public author bio page, e.g. /ru/author/<slug>.';
