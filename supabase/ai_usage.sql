-- Таблица счётчика AI-запросов (сбрасывается каждые сутки)
-- Выполнить в Supabase → SQL Editor

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  count     INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Индекс для быстрой проверки по пользователю и дате
CREATE INDEX IF NOT EXISTS ai_usage_user_date_idx ON ai_usage (user_id, date);

-- RLS: пользователь видит только свои записи
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own ai_usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (Vercel backend) может делать всё
CREATE POLICY "Service role full access"
  ON ai_usage FOR ALL
  USING (true)
  WITH CHECK (true);
