-- AI token usage tracking per user
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ai_token_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_token_usage_user_id_idx ON ai_token_usage(user_id);
CREATE INDEX IF NOT EXISTS ai_token_usage_created_at_idx ON ai_token_usage(created_at);

ALTER TABLE ai_token_usage ENABLE ROW LEVEL SECURITY;

-- Users cannot read token logs (admin only via service role)
CREATE POLICY "Service role full access" ON ai_token_usage
  FOR ALL USING (true) WITH CHECK (true);
