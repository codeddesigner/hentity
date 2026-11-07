-- Insights: Founders tab + Explore (the data engine). Figma "Founders data" (197:2481, 198:2702).
-- Founders tell us their founding team when they list, claim or edit a startup. Only totals ever leave the
-- database, and any group smaller than 5 is suppressed ("<5") whenever the founding team is involved.

alter table public.products add column if not exists founding_team text check (founding_team in ('women','mixed','men','unstated'));
alter table public.products add column if not exists founders_count int check (founders_count between 1 and 20);
alter table public.products add column if not exists founded_year int check (founded_year between 1980 and 2100);
alter table public.products add column if not exists raised_usd numeric check (raised_usd >= 0);
alter table public.products add column if not exists raised_year int check (raised_year between 1990 and 2100);
alter table public.radar add column if not exists founding_team text check (founding_team in ('women','mixed','men','unstated'));
alter table public.radar add column if not exists founded_year int check (founded_year between 1980 and 2100);
alter table public.radar add column if not exists raised_usd numeric check (raised_usd >= 0);
alter table public.radar add column if not exists raised_year int check (raised_year between 1990 and 2100);

-- Founding year we already know from radar facts ("Founded · 2019")
update public.radar r set founded_year = (select trim(f->>'value')::int from jsonb_array_elements(coalesce(r.facts, '[]')) f
  where f->>'key' = 'founded' and f->>'value' ~ '^\s*(19|20)\d\d\s*$' limit 1)
  where r.founded_year is null and exists (select 1 from jsonb_array_elements(coalesce(r.facts, '[]')) f where f->>'key' = 'founded' and f->>'value' ~ '^\s*(19|20)\d\d\s*$');

-- Makers set their founding team directly (self-reported, no approval needed); admins too
create or replace function public.set_founding_team(pid uuid, team text, founders int default null, founded int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from products where id = pid and (owner_id = auth.uid() or public.is_admin())) then raise exception 'Only the team can set this' using errcode = 'P0001'; end if;
  if team is not null and team not in ('women','mixed','men','unstated') then raise exception 'Unknown founding team' using errcode = 'P0001'; end if;
  update products set founding_team = team, founders_count = coalesce(founders, founders_count),
    founded_year = coalesce(founded, founded_year) where id = pid;
end $$;
grant execute on function public.set_founding_team(uuid, text, int, int) to authenticated;

-- Radar edits carry the new fields to the page too
create or replace function public.radar_push(rid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r radar; p products;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from radar where id = rid;
  if r.product_id is null then raise exception 'Not published yet' using errcode = 'P0001'; end if;
  if r.verified and coalesce(trim(r.registration), '') = '' then raise exception 'Add the registration number to give it the Verified tick' using errcode = 'P0001'; end if;
  update products set name = r.name, tagline = left(coalesce(r.tagline, ''), 140), description = coalesce(r.description, ''), website = coalesce(r.website, ''),
    categories = r.categories, country = r.country, city = coalesce(r.city, ''), logo_url = coalesce(r.logo_url, logo_url),
    active = r.active, inactive_note = case when r.active then null else nullif(trim(r.inactive_note), '') end,
    founding_team = coalesce(r.founding_team, founding_team), founded_year = coalesce(r.founded_year, founded_year),
    raised_usd = coalesce(r.raised_usd, raised_usd), raised_year = coalesce(r.raised_year, raised_year),
    verify = case when coalesce(trim(r.registration), '') = '' then verify - 'company' else verify || jsonb_build_object('company', trim(r.registration)) end
  where id = r.product_id;
  update products set verified = r.verified where id = r.product_id;
  update products set claim = coalesce(claim, '{}'::jsonb) || jsonb_build_object('facts', r.facts, 'news', r.news, 'checked_at', now(), 'contact_email', r.contact_email)
    where id = r.product_id and status = 'unclaimed';
  select * into p from products where id = r.product_id;
  perform public.audit('radar.update_page', 'product', p.id::text, jsonb_build_object('name', p.name, 'verified', p.verified, 'active', p.active));
  return jsonb_build_object('slug', p.slug, 'id', p.id, 'verified', p.verified);
end $$;
update public.products p set founded_year = r.founded_year from public.radar r where r.product_id = p.id and p.founded_year is null and r.founded_year is not null;

-- Every public startup with the fields Insights slices by
create or replace function public.insight_base() returns table (
  id uuid, country text, city text, categories text[], stage text, fy int, team text, founders int, claimed text, active text,
  created date, launched date, raised numeric, raised_year int, live boolean)
language sql stable security definer set search_path = public as $$
  select p.id, nullif(p.country, ''), nullif(trim(p.city), ''), coalesce(p.categories, '{}'), coalesce(nullif(p.stage, ''), 'Unknown'),
    coalesce(p.founded_year, extract(year from p.created_at)::int),
    coalesce(p.founding_team, 'unstated'),
    case p.founding_team when 'women' then coalesce(p.founders_count, 1) when 'men' then coalesce(p.founders_count, 1) when 'mixed' then greatest(coalesce(p.founders_count, 2), 2) else 0 end,
    case when p.status = 'unclaimed' then 'Unclaimed' else 'Claimed' end,
    case when p.active then 'Active' else 'Inactive' end,
    (p.created_at at time zone 'Africa/Lagos')::date,
    case when p.status in ('scheduled','live') then coalesce(p.launch_date, (coalesce(p.reviewed_at, p.created_at) at time zone 'Africa/Lagos')::date) end,
    p.raised_usd, p.raised_year, p.status in ('live','unclaimed','scheduled')
  from products p where p.status in ('scheduled','live','unclaimed');
$$;
revoke execute on function public.insight_base() from public, anon, authenticated;

create or replace function public.insights_founders(f jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare yr int := extract(year from now())::int; out jsonb;
begin
  f := coalesce(f, '{}');
  with b as (
    select * from public.insight_base() x
    where (coalesce(f->>'cc', '') = '' or x.country = f->>'cc')
      and (coalesce(f->>'city', '') = '' or x.city = f->>'city')
      and (coalesce(f->>'cat', '') = '' or (f->>'cat') = any(x.categories))
      and (coalesce(f->>'stage', '') = '' or x.stage = f->>'stage')
      and (coalesce(f->>'team', '') = '' or x.team = f->>'team')
      and (coalesce(f->>'from', '') = '' or x.fy >= (f->>'from')::int)
      and (coalesce(f->>'to', '') = '' or x.fy <= (f->>'to')::int)
  ),
  st as (select * from b where team <> 'unstated'),
  money as (select team, raised from st where raised > 0 and (coalesce(f->>'to', '') = '' or raised_year is null or raised_year <= (f->>'to')::int)),
  cities as (
    select city, country, count(*) n,
      count(*) filter (where team = 'women') w, count(*) filter (where team = 'mixed') m,
      count(*) filter (where team = 'men') men, count(*) filter (where team = 'unstated') u
    from b where city is not null group by city, country having count(*) >= 5),
  cats as (
    select c, count(*) n, count(*) filter (where team = 'women') w, count(*) filter (where team = 'mixed') m
    from st, unnest(st.categories) c group by c having count(*) >= 5),
  yrs as (select generate_series(yr - 6, yr) y)
  select jsonb_build_object(
    'startups', (select count(*) from b),
    'stated', (select count(*) from st),
    'founders', (select coalesce(sum(founders), 0) from st),
    'with_woman', (select count(*) from st where team in ('women','mixed')),
    'women', (select count(*) from st where team = 'women'),
    'stated_2022', (select count(*) from st where fy <= 2022),
    'with_woman_2022', (select count(*) from st where fy <= 2022 and team in ('women','mixed')),
    'raised_total', (select coalesce(sum(raised), 0) from money),
    'raised_women', (select coalesce(sum(raised), 0) from money where team = 'women'),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'cc', country, 'n', n, 'w', w, 'm', m, 'men', men, 'u', u)
                 order by (w + m)::numeric / nullif(n - u, 0) desc nulls last, n desc), '[]') from (select * from cities order by n desc limit 12) c),
    'trend', (select jsonb_agg(jsonb_build_object('y', y, 'n', (select count(*) from st where fy = y), 'ww', (select count(*) from st where fy = y and team in ('women','mixed'))) order by y) from yrs),
    'money', (select coalesce(jsonb_agg(jsonb_build_object('team', team, 'sum', s, 'n', k, 'median', med) order by s desc), '[]') from (
        select team, sum(raised) s, count(*) k, percentile_cont(0.5) within group (order by raised) med from money group by team) mm),
    'cats', (select coalesce(jsonb_agg(jsonb_build_object('name', c, 'n', n, 'w', w, 'm', m) order by (w + m)::numeric / n desc), '[]') from (select * from cats order by n desc limit 8) cc)
  ) into out;
  return out;
end $$;
grant execute on function public.insights_founders(jsonb) to anon, authenticated;

-- Explore: show [measure] of [dataset] by [dim] split by [dim] where [filters].
-- Datasets: startups, founders, funding, launches, visitors, reviews.  Dims: country, city, category, stage,
-- founded_year, founding_team, claimed, status, month.  Returns rows {k, s, v} plus totals per k.
create or replace function public.insights_explore(ds text, by text, split text default null, f jsonb default '{}', measure text default 'count')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  dims jsonb := '{"country":"country","city":"city","category":"cat","stage":"stage","founded_year":"fy::text","founding_team":"team","claimed":"claimed","status":"active","month":"month"}';
  kx text; sx text; base text; val text; sql text; res jsonb; tot jsonb; grand numeric; sens boolean;
begin
  f := coalesce(f, '{}');
  if not (dims ? by) then raise exception 'Unknown dimension %', by using errcode = 'P0001'; end if;
  if split is not null and split <> '' and not (dims ? split) then raise exception 'Unknown dimension %', split using errcode = 'P0001'; end if;
  if split = '' or split = by then split := null; end if;
  kx := dims ->> by; sx := coalesce(dims ->> split, 'null::text');
  sens := ds = 'founders' or by = 'founding_team' or coalesce(split = 'founding_team', false);
  base := case ds
    when 'startups' then 'select x.*, to_char(x.created, ''YYYY-MM'') as month, 1::numeric as val from public.insight_base() x'
    when 'founders' then 'select x.*, to_char(x.created, ''YYYY-MM'') as month, x.founders::numeric as val from public.insight_base() x where x.team <> ''unstated'''
    when 'funding' then 'select x.*, coalesce(x.raised_year::text, to_char(x.created, ''YYYY'')) as month, ' || case when measure = 'amount' then 'x.raised' else '1::numeric' end || ' as val from public.insight_base() x where x.raised > 0'
    when 'launches' then 'select x.*, to_char(x.launched, ''YYYY-MM'') as month, 1::numeric as val from public.insight_base() x where x.launched is not null'
    when 'visitors' then 'select x.*, to_char(v.created_at at time zone ''Africa/Lagos'', ''YYYY-MM'') as month, 1::numeric as val from public.perf_beacons v join public.products p on v.path = ''/products/'' || p.slug join public.insight_base() x on x.id = p.id where v.created_at > now() - interval ''365 days'''
    when 'reviews' then 'select x.*, to_char(c.created_at at time zone ''Africa/Lagos'', ''YYYY-MM'') as month, 1::numeric as val from public.comments c join public.insight_base() x on x.id = c.product_id'
    else null end;
  if base is null then raise exception 'Unknown dataset %', ds using errcode = 'P0001'; end if;
  sql := format($q$
    with b as (select * from (%s) z
      where ($1->>'cc' is null or $1->>'cc' = '' or z.country = $1->>'cc')
        and ($1->>'city' is null or $1->>'city' = '' or z.city = $1->>'city')
        and ($1->>'cat' is null or $1->>'cat' = '' or ($1->>'cat') = any(z.categories))
        and ($1->>'stage' is null or $1->>'stage' = '' or z.stage = $1->>'stage')
        and ($1->>'team' is null or $1->>'team' = '' or z.team = $1->>'team')
        and ($1->>'claimed' is null or $1->>'claimed' = '' or z.claimed = $1->>'claimed')
        and ($1->>'status' is null or $1->>'status' = '' or z.active = $1->>'status')
        and ($1->>'from' is null or $1->>'from' = '' or z.fy >= ($1->>'from')::int)
        and ($1->>'to' is null or $1->>'to' = '' or z.fy <= ($1->>'to')::int)),
    e as (select b.*, c.cat from b left join lateral unnest(case when %L then b.categories else array[null::text] end) c(cat) on true),
    g as (select %s::text k, %s::text s, sum(val) v from e where %s is not null group by 1, 2)
    select jsonb_build_object(
      'rows', coalesce((select jsonb_agg(jsonb_build_object('k', k, 's', s, 'v', case when %L and v < 5 then null else v end) order by k, s) from g where k in (select k from g group by k order by sum(v) desc limit 30)), '[]'),
      'totals', coalesce((select jsonb_object_agg(k, t) from (select k, sum(v) t from g group by k order by t desc limit 30) tt), '{}'),
      'grand', (select coalesce(sum(val), 0) from b))
    $q$, base, (by = 'category' or split = 'category'), kx, sx, kx, sens);
  execute sql using f into res;
  return res || jsonb_build_object('ds', ds, 'by', by, 'split', split, 'measure', measure, 'suppressed', sens);
end $$;
grant execute on function public.insights_explore(text, text, text, jsonb, text) to anon, authenticated;

-- Saved views
create table if not exists public.insight_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  query jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.insight_views enable row level security;
drop policy if exists "own insight views" on public.insight_views;
create policy "own insight views" on public.insight_views for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.insight_views to authenticated;
