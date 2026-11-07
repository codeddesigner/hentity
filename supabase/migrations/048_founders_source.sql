-- Where each founding-team answer came from: 'self' (the team told us) or 'public' (Hentity, from widely
-- reported founder information). A team's own answer always wins and is never overwritten by public data.
alter table public.product_founders add column if not exists source text not null default 'self' check (source in ('self','public'));

create or replace function public.set_founding_team(pid uuid, team text, founders int default null, founded int default null)
returns void language plpgsql security definer set search_path = public as $$
declare own boolean;
begin
  own := exists (select 1 from products where id = pid and (owner_id = auth.uid() or public.is_maker(pid)));
  if not own and not public.is_admin() then raise exception 'Only the team can set this' using errcode = 'P0001'; end if;
  if team is not null and team not in ('women','mixed','men','unstated') then raise exception 'Unknown founding team' using errcode = 'P0001'; end if;
  insert into product_founders (product_id, team, founders, source, updated_at) values (pid, team, founders, case when own then 'self' else 'public' end, now())
    on conflict (product_id) do update set team = excluded.team, founders = excluded.founders, source = excluded.source, updated_at = now();
  if founded is not null then update products set founded_year = founded where id = pid; end if;
end $$;

create or replace function public.radar_founders_push(rid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r radar;
begin
  select * into r from radar where id = rid;
  if r.product_id is null or r.founding_team is null then return; end if;
  insert into product_founders (product_id, team, source) values (r.product_id, r.founding_team, 'public')
    on conflict (product_id) do update set team = excluded.team, source = 'public', updated_at = now() where product_founders.source <> 'self';
end $$;
revoke execute on function public.radar_founders_push(uuid) from public, anon, authenticated;

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
    founded_year = coalesce(r.founded_year, founded_year),
    raised_usd = coalesce(r.raised_usd, raised_usd), raised_year = coalesce(r.raised_year, raised_year),
    verify = case when coalesce(trim(r.registration), '') = '' then verify - 'company' else verify || jsonb_build_object('company', trim(r.registration)) end
  where id = r.product_id;
  perform public.radar_founders_push(rid);
  update products set verified = r.verified where id = r.product_id;
  update products set claim = coalesce(claim, '{}'::jsonb) || jsonb_build_object('facts', r.facts, 'news', r.news, 'checked_at', now(), 'contact_email', r.contact_email)
    where id = r.product_id and status = 'unclaimed';
  select * into p from products where id = r.product_id;
  perform public.audit('radar.update_page', 'product', p.id::text, jsonb_build_object('name', p.name, 'verified', p.verified, 'active', p.active));
  return jsonb_build_object('slug', p.slug, 'id', p.id, 'verified', p.verified);
end $$;

drop function if exists public.insight_base();
create function public.insight_base() returns table (
  id uuid, country text, city text, categories text[], stage text, fy int, team text, founders int, claimed text, active text,
  created date, launched date, raised numeric, raised_year int, live boolean, src text)
language sql stable security definer set search_path = public as $$
  select p.id, nullif(p.country, ''), nullif(trim(p.city), ''), coalesce(p.categories, '{}'), coalesce(nullif(p.stage, ''), 'Unknown'),
    coalesce(p.founded_year, extract(year from p.created_at)::int),
    coalesce(pf.team, 'unstated'),
    case pf.team when 'women' then coalesce(pf.founders, 1) when 'men' then coalesce(pf.founders, 1) when 'mixed' then greatest(coalesce(pf.founders, 2), 2) else 0 end,
    case when p.status = 'unclaimed' then 'Unclaimed' else 'Claimed' end,
    case when p.active then 'Active' else 'Inactive' end,
    (p.created_at at time zone 'Africa/Lagos')::date,
    case when p.status in ('scheduled','live') then coalesce(p.launch_date, (coalesce(p.reviewed_at, p.created_at) at time zone 'Africa/Lagos')::date) end,
    p.raised_usd, p.raised_year, p.status in ('live','unclaimed','scheduled'), pf.source
  from products p left join product_founders pf on pf.product_id = p.id
  where p.status in ('scheduled','live','unclaimed');
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
    'self', (select count(*) from st where src = 'self'),
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

-- Founding teams and years for well-known startups, from widely reported founder information (public, not self-reported)
update public.radar r set founding_team = v.t, founded_year = coalesce(r.founded_year, v.y) from (values ('Paystack','men',2015),('Flutterwave','men',2016),('Andela','mixed',2014),('PiggyVest','mixed',2016),('Pocket','mixed',null),('Abeg','mixed',null),('Kuda','men',2019),('Chipper Cash','men',2018),('Moniepoint','men',2015),('M-KOPA','men',2011),('LemFi','men',2020),('Moove','men',2020),('Yoco','men',2013),('Wave','men',2017),('Cowrywise','men',2017),('Bamboo','mixed',2019),('Risevest','men',2019),('Chowdeck','men',2021),('Breadfast','men',2017),('Paymob','men',2015),('Fawry','men',2008),('Vezeeta','men',2012),('Swvl','men',2017),('Twiga Foods','men',2014),('Wasoko','men',2016),('MaxAB','men',2018),('Yellow Card','men',2016),('Luno','men',2013),('Takealot','men',2011),('Interswitch','men',2002),('FairMoney','men',2017),('Carbon','men',2012),('Helium Health','mixed',2016),('54gene','men',2019),('Edukoya','women',2021),('Lidya','men',2016),('Lazerpay','men',2021),('Okra','mixed',2019),('Mono','men',2020),('KOKO Networks','men',2013),('Copia','mixed',2013),('Sendy','men',2014),('MarketForce','men',2018),('uLesson','men',2019),('AltSchool Africa','men',2021),('Bitnob','men',2020),('Busha','men',2019),('Quidax','men',2018),('Geegpay','men',2022),('Raenest','men',2022),('Brass','men',2020),('Sabi','men',2020),('Alerzo','men',2019),('Autochek','men',2019),('Termii','men',2017),('mPharma','men',2013),('Zeepay','men',2014),('Farmerline','men',2013),('Esoko','men',2005),('Afrikrea','men',2013),('Hello Tractor','men',2014),('Babban Gona','men',2012),('ColdHubs','men',2015),('ThriveAgric','men',2017),('Releaf','men',2017),('Farmcrowdy','men',2016),('Kobo360','men',2017),('Lori Systems','men',2016),('Gokada','men',2018),('Max','men',2015),('Shuttlers','mixed',2016),('Lifebank','women',2016),('Famasi','men',2020),('DrugStoc','men',2015),('MDaaS Global','mixed',2016),('Ubenwa','men',2017),('Intron Health','men',2021),('BudgIT','men',2011),('Stears','men',2017),('TechCabal','men',2013),('Techpoint Africa','men',2015),('Nairametrics','men',2009),('Nairaland','men',2005),('Konga','men',2012),('Seamfix','men',2012),('SeamlessHR','men',2018),('Youverify','men',2019),('Prembly','men',2021),('Selar','men',2016),('Eden Life','men',2019),('Tuteria','men',2015),('Kwik Delivery','men',2019),('Gradely','men',2016),('Afrilearn','men',2019),('Plentywaka','men',2020),('Cellulant','men',2004),('Africa''s Talking','men',2010),('Apollo Agriculture','men',2016),('SunCulture','men',2012),('Sun King','men',2008),('d.light','men',2007),('BasiGo','men',2021),('Ampersand','men',2016),('Pezesha','women',2016),('Tala','women',2011),('Access Afya','women',2012),('Sanergy','mixed',2011),('Craft Silicon','men',2000),('Zindi','mixed',2018),('Lelapa','mixed',2022),('Aerobotics','men',2014),('DataProphet','men',2014),('Instabug','men',2012),('InstaDeep','mixed',2014),('Expensya','men',2014),('MNT-Halan','men',2018),('Halan','men',2017),('Thndr','men',2020),('Chari','mixed',2020),('Elmenus','men',2011),('Trella','men',2018),('Ozow','men',2014),('Stitch','men',2021),('Peach Payments','men',2012),('22seven','men',2012),('EasyEquities','men',2014),('Naked Insurance','mixed',2018),('Root','men',2016),('SweepSouth','mixed',2014),('WeThinkCode','mixed',2015),('Jumo','men',2014),('Mukuru','men',2004),('Clickatell','men',2000),('Praekelt','men',2007),('Siyavula','men',2012),('Offerzen','men',2015),('Eneza Education','mixed',2011),('Kasha','women',2016),('SafeBoda','men',2014),('Eversend','men',2017),('Numida','mixed',2016),('NALA','men',2017),('Selcom','men',2001),('Kippa','mixed',2020),('Pineapple','men',2017),('Smile ID','men',2017),('Vendease','men',2020),('Fincra','men',2020)) v(name, t, y) where r.name = v.name;
update public.products p set founded_year = coalesce(p.founded_year, r.founded_year) from public.radar r where r.product_id = p.id and r.founded_year is not null;
select public.radar_founders_push(id) from public.radar where product_id is not null and founding_team is not null;
