-- GIN index for fast tag-based filtering and search
-- Run in Supabase Dashboard → SQL Editor

-- Add tags column if it doesn't exist yet
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_recipes_tags_gin
  ON recipes USING gin(tags);

-- View: recipes without any tags (useful for admin batch tagging)
CREATE OR REPLACE VIEW recipes_without_tags AS
SELECT id, title, difficulty, prep_time, cook_time, is_public, created_at
FROM recipes
WHERE tags IS NULL OR array_length(tags, 1) IS NULL
ORDER BY created_at DESC;

-- Helper: count recipes per tag (useful for analytics)
CREATE OR REPLACE VIEW tag_stats AS
SELECT
  tag,
  count(*) AS recipe_count
FROM recipes, unnest(tags) AS tag
GROUP BY tag
ORDER BY recipe_count DESC;
