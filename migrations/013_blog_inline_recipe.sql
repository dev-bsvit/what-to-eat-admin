-- Lets a translation carry full recipe data (ingredients/steps/timing/
-- nutrition) directly, without requiring a row in the app's `recipes`
-- table. Until now the recipe-facts card + ingredients/steps blocks +
-- Recipe JSON-LD only rendered when a post was linked via recipe_id, which
-- wrongly forced every recipe-shaped guide article through the main
-- (app-wide, shared with the mobile app) recipes table just to get a
-- rich snippet. Run in Supabase Dashboard -> SQL Editor.

ALTER TABLE blog_post_translations ADD COLUMN IF NOT EXISTS recipe_json jsonb;

COMMENT ON COLUMN blog_post_translations.recipe_json IS
  'Optional self-contained recipe data for this translation: {prep_time_min, cook_time_min, servings, difficulty, cuisine, ingredients: string[], instructions: string[], nutrition: {calories, protein, fat, carbs}}. Used instead of (or alongside) recipe_id — recipe_id takes precedence if both are set.';
