-- Blog foundation (Phase I): categories, tags, posts, translations.
-- Run in Supabase Dashboard → SQL Editor.
--
-- Scope: manual article creation only (no AI generation/queue tables yet —
-- those land in a later migration once the AI pipeline phase starts).
-- Language codes match the app's existing 8 locales (see src/lib/translate.ts
-- APP_LANGUAGES): en, ru, de, it, fr, es, pt-BR, uk.

CREATE TABLE IF NOT EXISTS blog_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  icon        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_category_translations (
  category_id   uuid NOT NULL REFERENCES blog_categories(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  name          text NOT NULL,
  description   text,
  PRIMARY KEY (category_id, language_code)
);

CREATE TABLE IF NOT EXISTS blog_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_tag_translations (
  tag_id        uuid NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  name          text NOT NULL,
  PRIMARY KEY (tag_id, language_code)
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'in_review', 'scheduled', 'published', 'archived')),
  source            text NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('manual', 'ai_generated', 'ai_assisted')),
  recipe_id         uuid REFERENCES recipes(id) ON DELETE SET NULL,
  category_id       uuid REFERENCES blog_categories(id) ON DELETE SET NULL,
  cover_image_url   text,
  cover_image_alt   text,
  reading_time_min  int,
  view_count        bigint NOT NULL DEFAULT 0,
  published_at      timestamptz,
  scheduled_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_post_translations (
  post_id                 uuid NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  language_code           text NOT NULL,
  slug                    text NOT NULL,
  title                   text NOT NULL,
  excerpt                 text,
  content_json            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- Tiptap/ProseMirror document
  content_html            text,                                 -- cached render for RSS/public API
  meta_title              text,
  meta_description        text,
  og_image_url            text,
  faq_json                jsonb,                                -- [{q, a}] for FAQPage schema.org
  is_machine_translated   boolean NOT NULL DEFAULT false,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, language_code),
  UNIQUE (language_code, slug)
);

CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id  uuid NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id   uuid NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_published
  ON blog_posts(status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_category
  ON blog_posts(category_id);

CREATE INDEX IF NOT EXISTS idx_blog_post_translations_fts
  ON blog_post_translations USING gin (to_tsvector('russian', title || ' ' || coalesce(excerpt, '')));

COMMENT ON TABLE blog_posts IS 'Blog articles (manual + future AI-generated). One row per article, content lives in blog_post_translations per language.';
COMMENT ON TABLE blog_post_translations IS 'Per-language content of a blog post: title, body (Tiptap JSON), SEO meta, FAQ.';
COMMENT ON COLUMN blog_post_translations.content_json IS 'Tiptap document JSON — source of truth for the editor.';
COMMENT ON COLUMN blog_post_translations.content_html IS 'Denormalized HTML render of content_json, refreshed on save — used by the public blog frontend and RSS.';
