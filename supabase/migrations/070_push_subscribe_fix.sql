-- Fix: push_subscribe failed every time with "column reference endpoint is ambiguous" (its parameters share
-- names with the table's columns), so no device could ever be saved. Columns win; parameters are qualified.
create or replace function public.push_subscribe(endpoint text, p256dh text, auth text, device text default null) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (me, push_subscribe.endpoint, push_subscribe.p256dh, push_subscribe.auth, left(push_subscribe.device, 80))
  on conflict (endpoint) do update set user_id = me, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device;
end $$;
