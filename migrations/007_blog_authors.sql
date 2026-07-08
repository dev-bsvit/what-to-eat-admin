-- Blog authors (E-E-A-T): named expert byline + schema.org Person data.
-- Run in Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS blog_authors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  title       text,               -- credentials/role, e.g. "Шеф-повар, нутрициолог"
  bio         text,
  avatar_url  text,
  profile_url text,                -- canonical profile page (schema.org Person.url)
  same_as     text[] DEFAULT '{}', -- LinkedIn/Instagram/etc — schema.org Person.sameAs
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES blog_authors(id) ON DELETE SET NULL;

COMMENT ON TABLE blog_authors IS 'Named experts bylined on blog posts — required for Article/Recipe schema.org author + E-E-A-T signals.';
