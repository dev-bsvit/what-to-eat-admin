-- Cache of parsed Instagram imports keyed by reel shortcode.
-- A reel parsed once is served instantly afterwards and never re-fetched
-- from Instagram (rate-limit / ban protection).
-- Run this migration in your Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS instagram_import_cache (
  shortcode TEXT PRIMARY KEY,
  recipe JSONB NOT NULL,
  source_url TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Service-role access only (route uses SUPABASE_SERVICE_ROLE_KEY)
ALTER TABLE instagram_import_cache ENABLE ROW LEVEL SECURITY;
