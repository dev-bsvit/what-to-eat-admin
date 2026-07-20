CREATE TABLE IF NOT EXISTS ai_social_monitor_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'threads',
  topic text NOT NULL,
  mention_count integer NOT NULL DEFAULT 0,
  window_count integer NOT NULL DEFAULT 0,
  previous_window_count integer NOT NULL DEFAULT 0,
  growth_ratio numeric NOT NULL DEFAULT 0,
  is_trending boolean NOT NULL DEFAULT false,
  sample_post_url text,
  sample_post_text text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, topic)
);

CREATE INDEX IF NOT EXISTS ai_social_monitor_trends_trending_idx
  ON ai_social_monitor_trends (is_trending DESC, window_count DESC, last_seen_at DESC);

ALTER TABLE ai_social_monitor_notifications
  DROP CONSTRAINT IF EXISTS ai_social_monitor_notifications_post_id_fkey;

ALTER TABLE ai_social_monitor_notifications
  ALTER COLUMN post_id DROP NOT NULL;

ALTER TABLE ai_social_monitor_notifications
  ADD CONSTRAINT ai_social_monitor_notifications_post_id_fkey
  FOREIGN KEY (post_id) REFERENCES ai_social_monitor_posts(id) ON DELETE CASCADE;

ALTER TABLE ai_social_monitor_notifications
  ADD COLUMN IF NOT EXISTS trend_id uuid REFERENCES ai_social_monitor_trends(id) ON DELETE CASCADE;

ALTER TABLE ai_social_monitor_notifications
  DROP CONSTRAINT IF EXISTS ai_social_monitor_notifications_post_id_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS ai_social_monitor_notifications_post_type_idx
  ON ai_social_monitor_notifications (post_id, type) WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_social_monitor_notifications_trend_type_idx
  ON ai_social_monitor_notifications (trend_id, type) WHERE trend_id IS NOT NULL;
