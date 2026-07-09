-- blog_authors.title/bio were shared across every language (like
-- categories/tags before their _translations tables existed), which is why
-- an author's role showed in Russian ("Редакция рецептов") even on a
-- Ukrainian page. Mirrors blog_category_translations / blog_tag_translations.
-- Run in Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS blog_author_translations (
  author_id     uuid NOT NULL REFERENCES blog_authors(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  title         text,
  bio           text,
  PRIMARY KEY (author_id, language_code)
);

COMMENT ON TABLE blog_author_translations IS
  'Per-language title/bio for a blog author. blog_authors.title/bio remain as a legacy fallback for languages with no row here.';
