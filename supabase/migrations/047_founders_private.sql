-- Founding team is private: product rows are publicly readable, so the answer lives in its own table that
-- only the startup's team and admins can read. Insights reads it through security-definer functions (totals only).
create table if not exists public.product_founders (
  product_id uuid primary key references public.products(id) on delete cascade,
  team text check (team in ('women','mixed','men','unstated')),
  founders int check (founders between 1 and 20),
  updated_at timestamptz not null default now());
alter table public.product_founders enable row level security;
drop policy if exists "founders own" on public.product_founders;
create policy "founders own" on public.product_founders for select using (
  public.is_admin() or exists (select 1 from public.products p where p.id = product_id and (p.owner_id = auth.uid() or public.is_maker(p.id))));
grant select on public.product_founders to authenticated;

insert into public.product_founders (product_id, team, founders)
  select id, founding_team, founders_count from public.products where founding_team is not null or founders_count is not null
  on conflict (product_id) do nothing;
alter table public.products drop column if exists founding_team;
alter table public.products drop column if exists founders_count;

create or replace function public.set_founding_team(pid uuid, team text, founders int default null, founded int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from products where id = pid and (owner_id = auth.uid() or public.is_maker(pid) or public.is_admin())) then raise exception 'Only the team can set this' using errcode = 'P0001'; end if;
  if team is not null and team not in ('women','mixed','men','unstated') then raise exception 'Unknown founding team' using errcode = 'P0001'; end if;
  insert into product_founders (product_id, team, founders, updated_at) values (pid, team, founders, now())
    on conflict (product_id) do update set team = excluded.team, founders = excluded.founders, updated_at = now();
  if founded is not null then update products set founded_year = founded where id = pid; end if;
end $$;

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
  if r.founding_team is not null then
    insert into product_founders (product_id, team) values (r.product_id, r.founding_team)
      on conflict (product_id) do update set team = excluded.team, updated_at = now();
  end if;
  update products set verified = r.verified where id = r.product_id;
  update products set claim = coalesce(claim, '{}'::jsonb) || jsonb_build_object('facts', r.facts, 'news', r.news, 'checked_at', now(), 'contact_email', r.contact_email)
    where id = r.product_id and status = 'unclaimed';
  select * into p from products where id = r.product_id;
  perform public.audit('radar.update_page', 'product', p.id::text, jsonb_build_object('name', p.name, 'verified', p.verified, 'active', p.active));
  return jsonb_build_object('slug', p.slug, 'id', p.id, 'verified', p.verified);
end $$;

create or replace function public.insight_base() returns table (
  id uuid, country text, city text, categories text[], stage text, fy int, team text, founders int, claimed text, active text,
  created date, launched date, raised numeric, raised_year int, live boolean)
language sql stable security definer set search_path = public as $$
  select p.id, nullif(p.country, ''), nullif(trim(p.city), ''), coalesce(p.categories, '{}'), coalesce(nullif(p.stage, ''), 'Unknown'),
    coalesce(p.founded_year, extract(year from p.created_at)::int),
    coalesce(pf.team, 'unstated'),
    case pf.team when 'women' then coalesce(pf.founders, 1) when 'men' then coalesce(pf.founders, 1) when 'mixed' then greatest(coalesce(pf.founders, 2), 2) else 0 end,
    case when p.status = 'unclaimed' then 'Unclaimed' else 'Claimed' end,
    case when p.active then 'Active' else 'Inactive' end,
    (p.created_at at time zone 'Africa/Lagos')::date,
    case when p.status in ('scheduled','live') then coalesce(p.launch_date, (coalesce(p.reviewed_at, p.created_at) at time zone 'Africa/Lagos')::date) end,
    p.raised_usd, p.raised_year, p.status in ('live','unclaimed','scheduled')
  from products p left join product_founders pf on pf.product_id = p.id
  where p.status in ('scheduled','live','unclaimed');
$$;
revoke execute on function public.insight_base() from public, anon, authenticated;
