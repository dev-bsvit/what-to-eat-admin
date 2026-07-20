CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_social_monitor_settings (
  id text PRIMARY KEY DEFAULT 'default',
  product_name text NOT NULL DEFAULT '',
  product_description text NOT NULL DEFAULT '',
  core_features text[] NOT NULL DEFAULT '{}',
  target_audience text NOT NULL DEFAULT '',
  competitors text[] NOT NULL DEFAULT '{}',
  extra_context text NOT NULL DEFAULT '',
  enabled_sources text[] NOT NULL DEFAULT '{}',
  check_interval_minutes integer NOT NULL DEFAULT 180 CHECK (check_interval_minutes >= 15),
  high_score_threshold integer NOT NULL DEFAULT 78 CHECK (high_score_threshold BETWEEN 0 AND 100),
  notifications_enabled boolean NOT NULL DEFAULT true,
  search_strategy jsonb,
  last_scan_at timestamptz,
  next_scan_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_social_monitor_sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('connected', 'not_configured', 'error')),
  auth_type text NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none', 'api_key', 'oauth', 'json_endpoint')),
  config jsonb NOT NULL DEFAULT '{}',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_social_monitor_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  query_text text NOT NULL,
  language text,
  country text,
  rationale text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  generated_by text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai', 'fallback', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS ai_social_monitor_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NOT NULL,
  author_name text,
  author_handle text,
  author_url text,
  country text,
  language text,
  posted_at timestamptz,
  text text NOT NULL,
  text_translation text,
  original_url text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}',
  ai_score integer NOT NULL DEFAULT 0 CHECK (ai_score BETWEEN 0 AND 100),
  ai_summary text NOT NULL DEFAULT '',
  ai_reason text NOT NULL DEFAULT '',
  ai_problem text NOT NULL DEFAULT '',
  ai_goal text NOT NULL DEFAULT '',
  ai_emotion text NOT NULL DEFAULT '',
  ai_conversion_probability integer NOT NULL DEFAULT 0 CHECK (ai_conversion_probability BETWEEN 0 AND 100),
  ai_should_reply boolean NOT NULL DEFAULT false,
  ai_reply text NOT NULL DEFAULT '',
  detected_competitors text[] NOT NULL DEFAULT '{}',
  ai_analysis jsonb NOT NULL DEFAULT '{}',
  reply_status text NOT NULL DEFAULT 'none' CHECK (reply_status IN ('none', 'copied', 'replied', 'ignored')),
  feedback text CHECK (feedback IN ('useful', 'not_useful')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'archived')),
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS ai_social_monitor_posts_score_idx
  ON ai_social_monitor_posts (ai_score DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_social_monitor_posts_filters_idx
  ON ai_social_monitor_posts (source, language, country, reply_status, feedback, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_social_monitor_posts_text_idx
  ON ai_social_monitor_posts USING gin (
    to_tsvector('simple', coalesce(text, '') || ' ' || coalesce(ai_problem, '') || ' ' || coalesce(ai_goal, '') || ' ' || coalesce(ai_summary, ''))
  );

CREATE INDEX IF NOT EXISTS ai_social_monitor_posts_embedding_idx
  ON ai_social_monitor_posts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE IF NOT EXISTS ai_social_monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  manual boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sources_checked text[] NOT NULL DEFAULT '{}',
  posts_found integer NOT NULL DEFAULT 0,
  posts_analyzed integer NOT NULL DEFAULT 0,
  generated_queries jsonb NOT NULL DEFAULT '[]',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_social_monitor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES ai_social_monitor_posts(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'high_score',
  score integer NOT NULL DEFAULT 0,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, type)
);

CREATE OR REPLACE FUNCTION match_ai_social_monitor_posts(
  query_embedding vector(1536),
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  source text,
  external_id text,
  author_name text,
  author_handle text,
  author_url text,
  country text,
  language text,
  posted_at timestamptz,
  text text,
  text_translation text,
  original_url text,
  ai_score integer,
  ai_summary text,
  ai_reason text,
  ai_problem text,
  ai_goal text,
  ai_emotion text,
  ai_conversion_probability integer,
  ai_should_reply boolean,
  ai_reply text,
  detected_competitors text[],
  reply_status text,
  feedback text,
  status text,
  created_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.source,
    p.external_id,
    p.author_name,
    p.author_handle,
    p.author_url,
    p.country,
    p.language,
    p.posted_at,
    p.text,
    p.text_translation,
    p.original_url,
    p.ai_score,
    p.ai_summary,
    p.ai_reason,
    p.ai_problem,
    p.ai_goal,
    p.ai_emotion,
    p.ai_conversion_probability,
    p.ai_should_reply,
    p.ai_reply,
    p.detected_competitors,
    p.reply_status,
    p.feedback,
    p.status,
    p.created_at,
    1 - (p.embedding <=> query_embedding) AS similarity
  FROM ai_social_monitor_posts p
  WHERE p.embedding IS NOT NULL
  ORDER BY p.embedding <=> query_embedding, p.ai_score DESC
  LIMIT match_count;
$$;

INSERT INTO ai_social_monitor_settings (
  id,
  product_name,
  product_description,
  core_features,
  target_audience,
  competitors,
  extra_context,
  enabled_sources,
  check_interval_minutes,
  high_score_threshold,
  notifications_enabled
) VALUES (
  'default',
  'Dishday',
  'Dishday helps people decide what to cook, plan meals, use pantry ingredients, save recipes, build shopping lists, and discover practical recipe ideas.',
  ARRAY['AI meal recommendations', 'Recipe import from social links', 'Pantry-based cooking ideas', 'Meal planning', 'Shopping lists', 'Personal recipe library'],
  'Busy people, families, students, home cooks, and anyone who often does not know what to cook or wants to reduce food waste.',
  ARRAY['Mealime', 'Samsung Food', 'Yummly', 'Paprika', 'Intent', 'SideChef'],
  'Look for natural complaints and intent signals, not only exact app keywords.',
  ARRAY['reddit'],
  180,
  78,
  true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO ai_social_monitor_sources (id, name, enabled, status, auth_type, config)
VALUES
  ('reddit', 'Reddit', true, 'connected', 'none', '{"limit_per_query": 12}'),
  ('json_endpoint', 'Custom JSON endpoint', false, 'not_configured', 'json_endpoint', '{"endpoint_url":"","method":"GET","query_param":"q"}'),
  ('x', 'X / Twitter', false, 'not_configured', 'api_key', '{}'),
  ('threads', 'Threads', false, 'not_configured', 'api_key', '{}')
ON CONFLICT (id) DO NOTHING;
