-- Fix: один и тот же APNs-токен устройства может переходить от одного
-- пользователя к другому (другой аккаунт на том же телефоне). Прямой upsert
-- по token упирается в RLS (auth.uid() = user_id старой строки), и токен
-- не сохраняется — пуши не доходят.
--
-- Решение: SECURITY DEFINER функция, которая всегда назначает владельцем
-- текущего auth.uid(). Пользователь может «забрать» токен только себе,
-- чужие строки переписать на произвольного владельца нельзя.
-- Run this migration in your Supabase SQL Editor.

create or replace function public.claim_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into push_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), p_token, p_platform, now())
  on conflict (token)
  do update set user_id    = auth.uid(),
                platform   = excluded.platform,
                updated_at = now();
end;
$$;

grant execute on function public.claim_push_token(text, text) to authenticated;
