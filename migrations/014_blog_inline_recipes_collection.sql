-- Lets a "collection" article embed several full recipes directly in the
-- translation (own title, ingredients, steps, timing, nutrition each),
-- without every recipe needing a row in the app's `recipes` table — the
-- same idea as migration 013's recipe_json, but for multiple recipes.
-- Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE blog_post_translations ADD COLUMN IF NOT EXISTS recipes_json jsonb;

COMMENT ON COLUMN blog_post_translations.recipes_json IS
  'Optional array of self-contained recipes for a "collection" article: [{title, label, note, prep_time_min, cook_time_min, servings, difficulty, cuisine, ingredients: string[], instructions: string[], nutrition}]. Alternative to related_recipes when the recipes are not in the recipes table.';
