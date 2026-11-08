-- Admin → Broadcast, rebuilt: send a push notification, an in-app notification, or both, to an audience,
-- see how many people and devices it will reach before sending, and a history with delivery counts.
-- Pushes go out in batches straight to /api/push (not one per notification row); /api/push reports each
-- batch's deliveries back against the broadcast.
-- Audience: { "who": "all" | "founders" | "investors" | "testers" | "city" | "category", "city": "...", "category": "..." }

create table if not exists public.push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  title text not null, body text not null default '', link text,
  audience jsonb not null default '{"who":"all"}',
  mode text not null check (mode in ('push', 'inapp', 'both')),
  people int not null default 0, devices int not null default 0, delivered int not null default 0, gone int not null default 0,
  created_at timestamptz not null default now());
alter table public.push_broadcasts enable row level security;
drop policy if exists "broadcasts admin" on public.push_broadcasts;
create policy "broadcasts admin" on public.push_broadcasts for select using (public.is_admin());
grant select on public.push_broadcasts to authenticated;

-- Who an audience covers (real, active members only)
create or replace function public.bc_audience(aud jsonb) returns table (uid uuid)
language sql stable security definer set search_path = public as $$
  select u.id from profiles u
  where not u.is_seed and not u.banned
    and case coalesce(aud ->> 'who', 'all')
      when 'all' then true
      when 'founders' then exists (select 1 from products p where p.owner_id = u.id and p.status in ('live', 'scheduled', 'review', 'changes'))
                        or exists (select 1 from product_makers m join products p on p.id = m.product_id where m.user_id = u.id and m.accepted and p.status in ('live', 'scheduled'))
      when 'investors' then u.kind = 'investor'
      when 'testers' then exists (select 1 from beta_applications a where a.user_id = u.id and a.status = 'accepted')
      when 'city' then lower(trim(coalesce(u.city, ''))) = lower(trim(coalesce(aud ->> 'city', '')))
      when 'category' then exists (select 1 from products p where (p.owner_id = u.id or exists (select 1 from product_makers m where m.product_id = p.id and m.user_id = u.id and m.accepted))
                                   and p.status in ('live', 'scheduled') and (aud ->> 'category') = any(p.categories))
      else false end;
$$;

-- Members who have push on and aren't paused
create or replace function public.bc_push_ok(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((settings ->> 'push') <> 'false', true)
     and not coalesce((settings ->> 'pause_until')::timestamptz > now(), false)
  from profiles where id = u;
$$;

create or replace function public.admin_broadcast_preview(aud jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
  return (select jsonb_build_object(
    'people', (select count(*) from public.bc_audience(aud)),
    'push_people', (select count(distinct s.user_id) from push_subscriptions s join public.bc_audience(aud) a on a.uid = s.user_id where public.bc_push_ok(s.user_id)),
    'devices', (select count(*) from push_subscriptions s join public.bc_audience(aud) a on a.uid = s.user_id where public.bc_push_ok(s.user_id))));
end $$;

create or replace function public.admin_broadcast_send(ttl text, bdy text, lnk text, aud jsonb, mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid; np int := 0; nd int := 0; secret text; batch jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
  ttl := trim(coalesce(ttl, '')); bdy := trim(coalesce(bdy, ''));
  if char_length(ttl) < 2 then raise exception 'Add a title' using errcode = 'P0001'; end if;
  if mode not in ('push', 'inapp', 'both') then raise exception 'Pick how to send it' using errcode = 'P0001'; end if;
  lnk := nullif(trim(coalesce(lnk, '')), '');
  if lnk is not null and lnk !~ '^(/|https://)' then raise exception 'Links start with / (a Hentity page) or https://' using errcode = 'P0001'; end if;
  select count(*) into np from public.bc_audience(aud);
  if np = 0 then raise exception 'Nobody matches this audience' using errcode = 'P0001'; end if;
  insert into push_broadcasts (created_by, title, body, link, audience, mode, people) values (auth.uid(), left(ttl, 120), left(bdy, 300), lnk, aud, mode, np) returning id into bid;
  if mode in ('inapp', 'both') then
    -- type 'announcement' is skipped by the push trigger: the pushes for this go out in batches below
    insert into notifications (user_id, type, grp, title, body, link, actor_id)
    select uid, 'announcement', 'system', public.h_esc(left(ttl, 120)), left(bdy, 300), lnk, auth.uid() from public.bc_audience(aud);
  end if;
  if mode in ('push', 'both') then
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
    for batch in
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from (select s.*, (row_number() over (order by s.created_at) - 1) / 20 grp from push_subscriptions s join public.bc_audience(aud) a on a.uid = s.user_id where public.bc_push_ok(s.user_id)) s
      group by s.grp
    loop
      nd := nd + jsonb_array_length(batch);
      perform net.http_post(url := 'https://hentity.com/api/push',
        body := jsonb_build_object('subs', batch, 'title', left(ttl, 120), 'body', left(bdy, 300), 'url', coalesce(lnk, '/notifications'), 'tag', 'broadcast:' || bid, 'bid', bid),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret), timeout_milliseconds := 8000);
    end loop;
    update push_broadcasts set devices = nd where id = bid;
  end if;
  perform audit('notifications.broadcast', mode, bid, jsonb_build_object('title', ttl, 'people', np, 'devices', nd, 'audience', aud));
  return jsonb_build_object('id', bid, 'people', np, 'devices', nd);
end $$;
grant execute on function public.admin_broadcast_preview(jsonb), public.admin_broadcast_send(text, text, text, jsonb, text) to authenticated;
revoke execute on function public.bc_audience(jsonb), public.bc_push_ok(uuid) from public, anon, authenticated;

-- /api/push reports back per broadcast too
drop function if exists public.push_result(text, text[], text[]);
create or replace function public.push_result(secret text, gone text[] default '{}', ok text[] default '{}', bid uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if secret is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'push_secret') then return; end if;
  delete from push_subscriptions where endpoint = any(gone);
  update push_subscriptions set last_ok_at = now() where endpoint = any(ok);
  if bid is not null then update push_broadcasts set delivered = delivered + coalesce(cardinality(ok), 0), gone = push_broadcasts.gone + coalesce(cardinality(push_result.gone), 0) where id = bid; end if;
end $$;
grant execute on function public.push_result(text, text[], text[], uuid) to anon, authenticated;

-- The per-notification trigger leaves announcements to the batched sender
create or replace function public.push_dispatch() returns trigger
language plpgsql security definer set search_path = public as $$
declare st jsonb; pref text; subs jsonb; secret text;
begin
  if new.type = 'announcement' then return new; end if;
  select settings into st from profiles where id = new.user_id;
  st := coalesce(st, '{}');
  if (st ->> 'push') = 'false' then return new; end if;
  if (st ->> 'pause_until') is not null and (st ->> 'pause_until')::timestamptz > now() and new.grp <> 'system' then return new; end if;
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
  return new;
end $$;

-- The old "in-app to everyone" broadcast now goes through the new sender
create or replace function public.admin_broadcast(ttl text, bdy text, lnk text default null) returns int
language plpgsql security definer set search_path = public as $$
begin
  return (public.admin_broadcast_send(ttl, bdy, lnk, '{"who":"all"}', 'inapp') ->> 'people')::int;
end $$;
