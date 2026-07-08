-- article_type (single recipe / collection of recipes / plain guide) +
-- blog_post_recipes (many-to-many for "collection" articles that reference
-- several recipes, e.g. "5 fast dinners"). Both are read by the AI import
-- endpoint (/api/admin/blog/import) and the public blog frontend.
-- Run in Supabase Dashboard → SQL Editor.

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS article_type text NOT NULL DEFAULT 'guide'
  CHECK (article_type IN ('guide', 'recipe', 'collection'));

CREATE TABLE IF NOT EXISTS blog_post_recipes (
  post_id    uuid NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  recipe_id  uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position   int NOT NULL DEFAULT 0,
  label      text,   -- e.g. "Главный быстрый ужин"
  note       text,   -- short editorial note on why this recipe is in the collection
  PRIMARY KEY (post_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_blog_post_recipes_post ON blog_post_recipes(post_id, position);

COMMENT ON COLUMN blog_posts.article_type IS 'guide = plain article, recipe = tied to one recipe_id, collection = list of recipes via blog_post_recipes.';
COMMENT ON TABLE blog_post_recipes IS 'Recipes referenced by a "collection" article (e.g. "5 fast dinners"), ordered by position.';
