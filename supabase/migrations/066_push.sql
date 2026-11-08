-- Push notifications for the installed app (and any browser that supports Web Push).
-- Each device a member turns push on for saves a subscription here. When a row lands in notifications, the
-- trigger below sends the recipient's subscriptions and the message to /api/push (pg_net, asynchronous), which
-- encrypts and delivers it. It respects the member's settings: push switched off, everything paused, or the
-- in-app switch for that kind of notification turned off in Settings → Notifications.
-- The shared secret lives in Vault as "push_secret" (created separately, never in a migration file).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  device text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Save (or move to this account) a device's subscription
create or replace function public.push_subscribe(endpoint text, p256dh text, auth text, device text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, device) values (auth.uid(), endpoint, p256dh, push_subscribe.auth, left(device, 80))
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device;
end $$;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

-- /api/push reports back: delivered (keep) and gone (forget)
create or replace function public.push_result(secret text, gone text[] default '{}', ok text[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  if secret is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret') then return; end if;
  delete from push_subscriptions where endpoint = any(gone);
  update push_subscriptions set last_ok_at = now() where endpoint = any(ok);
end $$;
grant execute on function public.push_result(text, text[], text[]) to anon, authenticated;

-- Plain text for the lock screen: titles can carry escaped names
create or replace function public.push_text(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(replace(regexp_replace(coalesce(t, ''), '<[^>]+>', '', 'g'), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&');
$$;

create or replace function public.push_dispatch() returns trigger
language plpgsql security definer set search_path = public as $$
declare st jsonb; pref text; subs jsonb; secret text;
begin
  select settings into st from profiles where id = new.user_id;
  st := coalesce(st, '{}');
  if (st ->> 'push') = 'false' then return new; end if;
  if (st ->> 'pause_until') is not null and (st ->> 'pause_until')::timestamptz > now() and new.grp <> 'system' then return new; end if;
  -- the in-app switch for this kind of notification (Settings → Notifications) also governs push
  pref := case new.type when 'review' then 'review' when 'comment' then 'comments' when 'product_review' then 'comments'
                        when 'reply' then 'replies' when 'discuss_reply' then 'replies' when 'follow' then 'followers' when 'find' then 'find' else null end;
  if pref is not null and (st -> 'notif' ->> (pref || '.0')) = 'false' then return new; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into subs
  from (select * from push_subscriptions where user_id = new.user_id order by created_at desc limit 10) s;
  if subs is null then return new; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://hentity.com/api/push',
    body := jsonb_build_object('subs', subs, 'title', left(public.push_text(new.title), 120), 'body', left(public.push_text(new.body), 300),
      'url', coalesce(nullif(new.link, ''), '/notifications'), 'tag', new.type || ':' || coalesce(new.product_id::text, new.id::text),
      'badge', (select count(*) from notifications where user_id = new.user_id and read_at is null),
      'icon', (select logo_url from products where id = new.product_id)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    timeout_milliseconds := 5000);
  return new;
exception when others then
  return new;   -- a push problem never blocks the notification itself
end $$;
drop trigger if exists push_dispatch on public.notifications;
create trigger push_dispatch after insert on public.notifications for each row execute function public.push_dispatch();

-- "Send a test" from Settings: a real notification to yourself, which pushes like any other
create or replace function public.push_test() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  insert into notifications (user_id, type, grp, title, body, link)
  values (auth.uid(), 'push_test', 'system', 'Push notifications are on', 'You’ll get launches, replies and reviews here, even when Hentity is closed.', '/settings/notifications');
end $$;
grant execute on function public.push_test() to authenticated;
