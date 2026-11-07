-- Product analytics (Figma 249:3445 "V · Product analytics"): private to a product's team.
-- Events: seen (shown in a list), view (opened the page), click (a button on the page, e.g. website).
-- Visitors are a random id kept in the browser, never a name; signed-in visitors add their account so
-- the team sees roles in aggregate (founders, builders, beta testers, investors). City and country come
-- from the hosting edge (/api/t), device from the browser.

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('seen', 'view', 'click')),
  what text,                       -- click: website, video, follow, share, save, upvote, review, store
  source text,                     -- view/seen: launches, search, digest, badge, whatsapp, social, directory, saved, google, direct, other
  visitor text not null,
  user_id uuid references public.profiles(id) on delete set null,
  city text, country text,
  device text check (device is null or device in ('phone', 'computer')),
  created_at timestamptz not null default now());
create index if not exists product_events_p on public.product_events(product_id, created_at);
create index if not exists product_events_v on public.product_events(visitor, product_id, kind, created_at);
alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;

-- One call records a small batch. Repeats inside the window are dropped, so refreshing a page or
-- scrolling a list again doesn't inflate numbers. The team's own visits don't count.
create or replace function public.track_events(evs jsonb, city text default null, country text default null, device text default null)
returns int language plpgsql security definer set search_path = public as $$
declare e jsonb; n int := 0; pid uuid; k text; v text; me uuid := auth.uid(); win interval;
begin
  if jsonb_typeof(evs) <> 'array' then return 0; end if;
  for e in select * from jsonb_array_elements(evs) limit 60 loop
    begin pid := (e->>'p')::uuid; exception when others then continue; end;
    k := e->>'k'; v := left(coalesce(e->>'v', ''), 40);
    if k not in ('seen', 'view', 'click') or v !~ '^[a-z0-9]{8,40}$' then continue; end if;
    if not exists (select 1 from products where id = pid and status in ('live', 'scheduled', 'unclaimed')) then continue; end if;
    if me is not null and public.is_maker(pid) then continue; end if;
    win := case k when 'seen' then interval '12 hours' when 'view' then interval '30 minutes' else interval '10 seconds' end;
    if exists (select 1 from product_events x where x.visitor = v and x.product_id = pid and x.kind = k
               and coalesce(x.what, '') = coalesce(left(e->>'w', 20), '') and x.created_at > now() - win) then continue; end if;
    insert into product_events (product_id, kind, what, source, visitor, user_id, city, country, device)
    values (pid, k, nullif(left(e->>'w', 20), ''), nullif(left(e->>'s', 20), ''), v, me,
            nullif(left(track_events.city, 60), ''), nullif(upper(left(track_events.country, 2)), ''), case when track_events.device in ('phone', 'computer') then track_events.device end);
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.track_events(jsonb, text, text, text) to anon, authenticated;

-- Everything the Analytics tab shows, for one product and a period (days; 0 = since launch)
create or replace function public.product_analytics(pid uuid, days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p products; t0 timestamptz; t1 timestamptz := now(); span interval; prev0 timestamptz; out jsonb; launch date;
begin
  if not (public.is_maker(pid) or public.is_admin()) then raise exception 'Only the product’s team can see its analytics'; end if;
  select * into p from products where id = pid;
  launch := coalesce(p.launch_date, (p.created_at at time zone 'Africa/Lagos')::date);
  t0 := case when days > 0 then now() - make_interval(days => days) else least(launch::timestamptz, (select min(created_at) from product_events where product_id = pid)) end;
  t0 := coalesce(t0, launch::timestamptz);
  span := t1 - t0; prev0 := t0 - span;
  with ev as (select * from product_events where product_id = pid and created_at >= t0),
       pv as (select * from product_events where product_id = pid and created_at >= prev0 and created_at < t0),
       views as (select * from ev where kind = 'view'),
       clicks as (select * from ev where kind = 'click' and what = 'website'),
       roles as (
         select distinct on (v.user_id) v.user_id,
           case when exists (select 1 from products o where o.owner_id = v.user_id and o.status in ('live','scheduled'))
                  or exists (select 1 from product_makers m join products o on o.id = m.product_id where m.user_id = v.user_id and o.status in ('live','scheduled')) then 'founders'
                when u.kind = 'investor' then 'investors'
                when exists (select 1 from beta_applications a where a.user_id = v.user_id and a.status = 'accepted') then 'testers'
                else 'builders' end as role,
           u.kind = 'investor' and u.is_verified as vinv
         from views v join profiles u on u.id = v.user_id where v.user_id is not null)
  select jsonb_build_object(
    'product', jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'launch', launch, 'verified', p.verified, 'logo_url', p.logo_url, 'color', p.color, 'status', p.status),
    'from', t0, 'to', t1,
    'tracking_since', (select min(created_at) from product_events where product_id = pid),
    'kpi', jsonb_build_object(
      'views', (select count(*) from views), 'views_prev', (select count(*) from pv where kind = 'view'),
      'visitors', (select count(distinct visitor) from views),
      'new_visitors', (select count(distinct v.visitor) from views v where not exists (select 1 from product_events o where o.product_id = pid and o.visitor = v.visitor and o.kind = 'view' and o.created_at < t0)),
      'clicks', (select count(*) from clicks),
      'upvotes', (select count(*) from upvotes u where u.product_id = pid),
      'upvotes_period', (select count(*) from upvotes u where u.product_id = pid and u.created_at >= t0),
      'upvotes_launch', (select count(*) from upvotes u where u.product_id = pid and (u.created_at at time zone 'Africa/Lagos')::date = launch),
      'followers', p.follower_count,
      'followers_week', (select count(*) from follows f where f.target_type = 'product' and f.target_id = pid and f.created_at > now() - interval '7 days'),
      'saved', (select count(*) from bookmarks b where b.target_type = 'product' and b.target_id = pid),
      'saved_week', (select count(*) from bookmarks b where b.target_type = 'product' and b.target_id = pid and b.created_at > now() - interval '7 days'),
      'views_total', p.view_count, 'clicks_total', p.click_count),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'views', (select count(*) from views v where (v.created_at at time zone 'Africa/Lagos')::date = d),
                                                         'clicks', (select count(*) from clicks c where (c.created_at at time zone 'Africa/Lagos')::date = d)) order by d), '[]'::jsonb)
              from generate_series((t0 at time zone 'Africa/Lagos')::date, (t1 at time zone 'Africa/Lagos')::date, interval '1 day') g(d)),
    'funnel', jsonb_build_object(
      'seen', (select count(distinct visitor) from ev where kind = 'seen'),
      'opened', (select count(distinct visitor) from views),
      'clicked', (select count(distinct visitor) from clicks),
      'again', (select count(*) from (select visitor from clicks group by visitor having count(distinct (created_at at time zone 'Africa/Lagos')::date) > 1) a)),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('k', s, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(source, 'other') s, count(*) n from views group by 1) x),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'cc', country, 'n', n) order by n desc), '[]'::jsonb)
               from (select city, max(country) country, count(distinct visitor) n from views where city is not null group by city order by 3 desc limit 6) x),
    'roles', jsonb_build_object(
      'founders', (select count(*) from roles where role = 'founders'), 'builders', (select count(*) from roles where role = 'builders'),
      'testers', (select count(*) from roles where role = 'testers'), 'investors', (select count(*) from roles where role = 'investors'),
      'anon', (select count(distinct visitor) from views where user_id is null),
      'vinv', (select count(*) from roles where vinv),
      'vinv_clicked', (select count(distinct c.user_id) from clicks c join profiles u on u.id = c.user_id where u.kind = 'investor' and u.is_verified)),
    'buttons', (select coalesce(jsonb_agg(jsonb_build_object('k', what, 'n', n) order by n desc), '[]'::jsonb) from (select what, count(*) n from ev where kind = 'click' and what is not null group by what) x),
    'devices', jsonb_build_object('phone', (select count(*) from views where device = 'phone'), 'computer', (select count(*) from views where device = 'computer'))
  ) into out;
  return out;
end $$;
grant execute on function public.product_analytics(uuid, int) to authenticated;
