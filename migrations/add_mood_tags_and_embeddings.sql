-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add mood_tags column
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS mood_tags text[] DEFAULT '{}';

-- 3. Add embedding column (text-embedding-3-small = 1536 dims)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 4. Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS recipes_embedding_idx
  ON recipes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 5. Index for mood_tags filter
CREATE INDEX IF NOT EXISTS recipes_mood_tags_idx
  ON recipes USING gin (mood_tags);

-- 6. RPC function for vector similarity search
CREATE OR REPLACE FUNCTION match_recipes(
  query_embedding vector(1536),
  match_count     int DEFAULT 40,
  filter_cook_time int DEFAULT NULL,
  filter_mood     text DEFAULT NULL,
  exclude_ids     uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  id          uuid,
  title       text,
  description text,
  image_url   text,
  cook_time   int,
  prep_time   int,
  servings    int,
  difficulty  text,
  diet_tags   text[],
  mood_tags   text[],
  cuisine_id  uuid,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    r.id, r.title, r.description, r.image_url,
    r.cook_time, r.prep_time, r.servings, r.difficulty,
    r.diet_tags, r.mood_tags, r.cuisine_id,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM recipes r
  WHERE
    r.is_user_defined = false
    AND r.image_url IS NOT NULL
    AND r.embedding IS NOT NULL
    AND (filter_cook_time IS NULL OR r.cook_time <= filter_cook_time)
    AND (filter_mood IS NULL OR r.mood_tags @> ARRAY[filter_mood])
    AND (array_length(exclude_ids, 1) IS NULL OR r.id != ALL(exclude_ids))
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
$$;
