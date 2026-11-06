-- Badges & embeds (Figma: Studio · Badges & embeds). Makers put SVG badges on their own site; Hentity serves them,
-- so a new medal or count appears without touching their code. We count badge views, clicks back to Hentity
-- (?ref=badge) and upvotes that came from a badge click.

create table if not exists public.badge_stats (
  product_id uuid not null references public.products(id) on delete cascade,
  day date not null default (now() at time zone 'Africa/Lagos')::date,
  views int not null default 0,
  clicks int not null default 0,
  upvotes int not null default 0,
  primary key (product_id, day)
);
alter table public.badge_stats enable row level security;
drop policy if exists "badge stats owner" on public.badge_stats;
create policy "badge stats owner" on public.badge_stats for select
  using (exists (select 1 from products p where p.id = product_id and p.owner_id = auth.uid()) or public.is_admin());

-- Anonymous counter (called by the badge endpoint and by product pages)
create or replace function public.badge_hit(s text, ev text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if ev not in ('view','click','upvote') then return; end if;
  select id into pid from products where slug = s and status in ('scheduled','live');
  if pid is null then return; end if;
  insert into badge_stats (product_id, views, clicks, upvotes)
  values (pid, (ev = 'view')::int, (ev = 'click')::int, (ev = 'upvote')::int)
  on conflict (product_id, day) do update set
    views = badge_stats.views + excluded.views, clicks = badge_stats.clicks + excluded.clicks, upvotes = badge_stats.upvotes + excluded.upvotes;
end $$;

-- Public: what a product has earned (used by the SVG endpoint and the Studio)
create or replace function public.badge_info(s text) returns jsonb
language sql stable security definer set search_path = public as $$
  with p as (
    select pr.id, pr.slug, pr.name, pr.upvote_count, pr.week_id, pr.launch_date, pr.status, w.starts_at, w.ends_at
    from products pr left join weeks w on w.id = pr.week_id
    where pr.slug = s and pr.status in ('scheduled','live')
  ),
  wk as (
    select q.id, rank() over (order by q.upvote_count desc, q.reviewed_at asc) r
    from products q, p where q.week_id = p.week_id and q.status = 'live' and not q.promoted
  ),
  mo as (
    select q.id, rank() over (order by q.upvote_count desc, q.reviewed_at asc) r
    from products q, p where p.launch_date is not null and q.status = 'live' and not q.promoted
      and date_trunc('month', q.launch_date) = date_trunc('month', p.launch_date)
  )
  select case when p.id is null then null else jsonb_build_object(
    'name', p.name, 'slug', p.slug, 'upvotes', p.upvote_count, 'live', p.status = 'live',
    'week', p.week_id,
    'week_rank', (select r from wk where wk.id = p.id),
    'week_over', coalesce(p.ends_at <= now(), false),
    'week_label', case when p.starts_at is not null then to_char(p.starts_at at time zone 'Africa/Lagos', 'FMDD Mon') end,
    'month_rank', (select r from mo where mo.id = p.id),
    'month', case when p.launch_date is not null then to_char(p.launch_date, 'FMMonth YYYY') end,
    'month_over', coalesce(date_trunc('month', p.launch_date) < date_trunc('month', (now() at time zone 'Africa/Lagos')::date), false)
  ) end
  from p right join (select 1) one on true;
$$;

-- Owner: numbers for the Studio
create or replace function public.badge_summary(pid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from products where id = pid and (owner_id = auth.uid() or public.is_admin())) then jsonb_build_object(
    'views', coalesce((select sum(views) from badge_stats where product_id = pid and day > current_date - 30), 0),
    'clicks', coalesce((select sum(clicks) from badge_stats where product_id = pid and day > current_date - 30), 0),
    'upvotes', coalesce((select sum(upvotes) from badge_stats where product_id = pid), 0),
    'views_all', coalesce((select sum(views) from badge_stats where product_id = pid), 0)
  ) end;
$$;

grant execute on function public.badge_hit(text, text), public.badge_info(text) to anon, authenticated;
grant execute on function public.badge_summary(uuid) to authenticated;
grant select on public.badge_stats to authenticated;
