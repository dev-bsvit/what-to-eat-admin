-- Расширяет RPC match_recipes параметром filter_budget (1=низкий, 2=средний,
-- 3=высокий), чтобы ИИ-чат и recommend могли фильтровать подбор по бюджету.
-- Параметр с дефолтом null → обратно совместимо: старые вызовы без него работают.
-- Run this migration in your Supabase SQL Editor.

drop function if exists public.match_recipes(vector, integer, integer, text, uuid[]);

create or replace function public.match_recipes(
  query_embedding vector,
  match_count integer default 40,
  filter_cook_time integer default null,
  filter_mood text default null,
  exclude_ids uuid[] default '{}'::uuid[],
  filter_budget integer default null
)
returns table(
  id uuid, title text, description text, image_url text,
  cook_time integer, prep_time integer, servings integer, difficulty text,
  diet_tags text[], mood_tags text[], cuisine_id uuid, similarity double precision
)
language sql
stable
as $function$
  select r.id, r.title, r.description, r.image_url,
    r.cook_time, r.prep_time, r.servings, r.difficulty,
    r.diet_tags, r.mood_tags, r.cuisine_id,
    1 - (r.embedding <=> query_embedding) as similarity
  from recipes r
  where r.is_user_defined = false
    and r.image_url is not null
    and r.embedding is not null
    and (filter_cook_time is null or r.cook_time <= filter_cook_time)
    and (filter_mood is null or r.mood_tags @> array[filter_mood])
    and (filter_budget is null or r.budget_level = filter_budget)
    and (array_length(exclude_ids, 1) is null or r.id != all(exclude_ids))
  order by r.embedding <=> query_embedding
  limit match_count;
$function$;
