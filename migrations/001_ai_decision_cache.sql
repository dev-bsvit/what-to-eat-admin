-- AI Decision Cache table for token economy
-- Run this migration in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ai_decision_cache (
  input_hash TEXT PRIMARY KEY,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('link', 'create', 'translate', 'fill')),
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_ai_decision_cache_expires_at
ON ai_decision_cache(expires_at);

-- Index for decision type queries
CREATE INDEX IF NOT EXISTS idx_ai_decision_cache_type
ON ai_decision_cache(decision_type);

-- Add translations column to product_dictionary if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_dictionary' AND column_name = 'translations'
  ) THEN
    ALTER TABLE product_dictionary ADD COLUMN translations JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add source_locale column to product_dictionary if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_dictionary' AND column_name = 'source_locale'
  ) THEN
    ALTER TABLE product_dictionary ADD COLUMN source_locale TEXT DEFAULT 'ru';
  END IF;
END $$;

-- Comment for documentation
COMMENT ON TABLE ai_decision_cache IS 'Cache for AI moderation decisions to reduce API token usage';
COMMENT ON COLUMN ai_decision_cache.input_hash IS 'Hash of the input (ingredient name + decision type)';
COMMENT ON COLUMN ai_decision_cache.decision_type IS 'Type of AI decision: link, create, translate, or fill';
COMMENT ON COLUMN ai_decision_cache.result IS 'The AI decision result as JSON';
COMMENT ON COLUMN ai_decision_cache.expires_at IS 'When this cache entry expires (default 24h for most decisions)';
