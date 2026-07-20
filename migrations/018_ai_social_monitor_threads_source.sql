UPDATE ai_social_monitor_sources
SET
  name = 'Threads',
  auth_type = 'api_key',
  status = 'not_configured',
  config = jsonb_build_object(
    'base_url', 'https://graph.threads.net/v1.0',
    'endpoint_path', '/keyword_search',
    'query_param', 'q',
    'search_type_param', 'search_type',
    'search_type', 'recent',
    'fields', 'id,text,permalink,username,timestamp,media_type,media_product_type',
    'limit_per_query', 10,
    'access_token_env', 'THREADS_ACCESS_TOKEN'
  ),
  updated_at = now()
WHERE id = 'threads';

INSERT INTO ai_social_monitor_sources (id, name, enabled, status, auth_type, config)
VALUES (
  'threads',
  'Threads',
  false,
  'not_configured',
  'api_key',
  '{
    "base_url": "https://graph.threads.net/v1.0",
    "endpoint_path": "/keyword_search",
    "query_param": "q",
    "search_type_param": "search_type",
    "search_type": "recent",
    "fields": "id,text,permalink,username,timestamp,media_type,media_product_type",
    "limit_per_query": 10,
    "access_token_env": "THREADS_ACCESS_TOKEN"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
