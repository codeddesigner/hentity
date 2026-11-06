-- Insights (Figma: Discovery · Insights): public numbers on the African startup ecosystem as seen on Hentity.
-- Everything is counted from real rows: public products (scheduled or live), their launch days, categories,
-- cities, stages, and page views (perf_beacons records one row per page load).
create index if not exists products_launch_date_idx on public.products (launch_date) where status in ('scheduled','live');

create or replace function public.insights(cc text default null, days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with pr as (
    select p.*, coalesce(p.launch_date, (coalesce(p.reviewed_at, p.created_at) at time zone 'Africa/Lagos')::date) as day
    from products p
    where p.status in ('scheduled','live') and (cc is null or cc = '' or p.country = cc)
  ),
  win as (select greatest(1, least(coalesce(days, 30), 730)) d, (now() at time zone 'Africa/Lagos')::date today),
  cur as (select pr.* from pr, win where pr.day > win.today - win.d and pr.day <= win.today),
  prev as (select pr.* from pr, win where pr.day > win.today - 2 * win.d and pr.day <= win.today - win.d),
  live as (select * from pr where status = 'live' or (status = 'scheduled' and day <= (select today from win))),
  cats as (select unnest(categories) c, day from pr),
  firstcity as (select city, country, min(day) first from pr where coalesce(city, '') <> '' group by city, country),
  views as (
    select
      count(*) filter (where b.created_at > now() - make_interval(days => (select d from win))) cur,
      count(*) filter (where b.created_at <= now() - make_interval(days => (select d from win)) and b.created_at > now() - make_interval(days => 2 * (select d from win))) prev
    from perf_beacons b
    where b.created_at > now() - make_interval(days => 2 * (select d from win))
      and (cc is null or cc = '' or (b.path like '/products/%' and split_part(b.path, '/', 3) in (select slug from pr)))
  )
  select jsonb_build_object(
    'days', (select d from win),
    'live', (select count(*) from live),
    'live_week', (select count(*) from live where day > (select today from win) - 7),
    'launched', (select count(*) from cur),
    'launched_prev', (select count(*) from prev),
    'views', (select cur from views),
    'views_prev', (select prev from views),
    'cities', (select count(*) from firstcity),
    'cities_new', (select count(*) from firstcity, win where first > win.today - win.d),
    'heat', (select coalesce(jsonb_object_agg(day, n), '{}'::jsonb) from (select day, count(*) n from pr, win where day > win.today - 371 and day <= win.today + 35 group by day) h),
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('name', c, 'n', n, 'cur', cur, 'prev', prv) order by n desc, c), '[]'::jsonb) from (
        select c, count(*) n,
          count(*) filter (where day > (select today from win) - (select d from win)) cur,
          count(*) filter (where day <= (select today from win) - (select d from win) and day > (select today from win) - 2 * (select d from win)) prv
        from cats group by c) i),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('cc', country, 'n', n) order by n desc), '[]'::jsonb) from (select country, count(*) n from pr where coalesce(country, '') <> '' group by country) c),
    'city_list', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'cc', country, 'n', n, 'new', nw) order by n desc, city), '[]'::jsonb) from (
        select city, country, count(*) n, count(*) filter (where day > (select today from win) - (select d from win)) nw
        from pr where coalesce(city, '') <> '' group by city, country order by n desc, city limit 40) c),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(nullif(stage, ''), 'Unknown') stage, count(*) n from pr group by 1) s),
    'raised', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'slug', p.slug, 'raised', c.raised, 'stage', c.stage, 'cc', p.country) order by p.upvote_count desc), '[]'::jsonb)
        from pr p join companies c on c.id = p.company_id where coalesce(c.raised, '') not in ('', 'Undisclosed')),
    'total', (select count(*) from pr)
  );
$$;
grant execute on function public.insights(text, int) to anon, authenticated;
