-- Launch days (Figma update): makers pick a launch DAY, 6 launches per day, from tomorrow up to ~4 weeks ahead.
-- A product goes live at 06:00 WAT (05:00 UTC) on its day and stays on that week's board until Monday's reset.
alter table public.products add column if not exists launch_date date;

create or replace function public.day_capacity() returns int language sql immutable as $$ select 6 $$;
create or replace function public.launch_at(d date) returns timestamptz language sql immutable as $$ select (d::timestamp + interval '5 hours') at time zone 'UTC' $$;
create or replace function public.lagos_today() returns date language sql stable as $$ select (now() at time zone 'Africa/Lagos')::date $$;
create or replace function public.week_of_date(d date) returns int language sql stable set search_path = public as $$
  select id from weeks where starts_at <= public.launch_at(d) and ends_at > public.launch_at(d) order by id limit 1
$$;

-- Keep week_id in step with the chosen day (runs before guard_product: triggers fire in name order)
create or replace function public.ensure_week(d date) returns int language plpgsql security definer set search_path = public as $$
declare w int; mon timestamptz;
begin
  w := public.week_of_date(d);
  if w is not null then return w; end if;
  -- weeks run Monday 06:00 WAT to Monday 06:00 WAT
  mon := public.launch_at(d - ((extract(isodow from d)::int) - 1));
  insert into weeks (id, starts_at, ends_at, capacity) values ((select coalesce(max(id), 0) + 1 from weeks), mon, mon + interval '7 days', 42) returning id into w;
  return w;
end $$;
revoke execute on function public.ensure_week(date) from public, anon, authenticated;

create or replace function public.a_product_launch_week() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.launch_date is not null and (tg_op = 'INSERT' or new.launch_date is distinct from old.launch_date) then
    if new.launch_date <= public.lagos_today() + 40 then new.week_id := public.ensure_week(new.launch_date); end if;
  end if;
  return new;
end $$;
drop trigger if exists a_product_launch_week on public.products;
create trigger a_product_launch_week before insert or update on public.products for each row execute function public.a_product_launch_week();

create or replace function public.guard_product() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken int;
begin
  new.updated_at := now();
  if public.is_admin() or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.status := 'draft';
    new.featured := false; new.promoted := false; new.verified := false;
    new.upvote_count := 0; new.comment_count := 0; new.follower_count := 0; new.click_count := 0; new.view_count := 0;
    return new;
  end if;
  if current_setting('hentity.counter', true) = 'on' then return new; end if;
  new.featured := old.featured; new.promoted := old.promoted; new.verified := old.verified;
  new.upvote_count := old.upvote_count; new.comment_count := old.comment_count; new.follower_count := old.follower_count;
  new.click_count := old.click_count; new.view_count := old.view_count; new.owner_id := old.owner_id;
  new.review_note := old.review_note; new.review_items := old.review_items; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
  if new.status <> old.status then
    if not ((old.status in ('draft','changes') and new.status = 'review')
         or (old.status = 'review' and new.status = 'draft')
         or (old.status = 'scheduled' and new.status = 'draft')
         or (old.status in ('draft','changes','rejected') and new.status = 'archived')) then
      raise exception 'Status change % -> % is not allowed', old.status, new.status;
    end if;
    if new.status = 'review' then new.submitted_at := now(); end if;
  elsif old.status in ('review','live') then
    raise exception 'This product can''t be edited right now';
  elsif old.status = 'scheduled' then
    -- a scheduled maker may only move their day, and only before it starts
    if new.launch_date is not distinct from old.launch_date then raise exception 'This product can''t be edited right now'; end if;
    if old.launch_date is not null and public.launch_at(old.launch_date) <= now() then raise exception 'You’re already live, so the day can’t change'; end if;
  end if;
  -- a chosen day has to be bookable: from tomorrow, at most 35 days ahead, with a free spot
  if new.launch_date is not null and new.status in ('review','scheduled') and (new.launch_date is distinct from old.launch_date or new.status <> old.status) then
    if new.launch_date <= public.lagos_today() then raise exception 'DAY_PAST'; end if;
    if new.launch_date > public.lagos_today() + 35 then raise exception 'DAY_TOO_FAR'; end if;
    select count(*) into taken from products where launch_date = new.launch_date and status in ('review','scheduled','live') and id <> new.id;
    if taken >= public.day_capacity() then raise exception 'DAY_FULL'; end if;
  end if;
  return new;
end $$;

-- live = scheduled and its day (or, for old week bookings, its week) has started
create or replace view public.product_feed with (security_invoker = true) as
 select p.id, p.slug, p.name, p.tagline, p.description, p.website, p.color, p.logo_url, p.media, p.video_url, p.categories,
    p.country, p.city, p.countries, p.pay_methods, p.currencies, p.languages, p.platforms, p.stage, p.company_id, p.owner_id,
    p.status, p.week_id, p.intro, p.support_pledge, p.featured, p.promoted, p.verified, p.verify, p.review_note, p.review_items,
    p.submitted_at, p.reviewed_at, p.reviewed_by, p.upvote_count, p.comment_count, p.follower_count, p.click_count, p.view_count,
    p.created_at, p.updated_at,
    case when p.status = 'scheduled' and coalesce(public.launch_at(p.launch_date), w.starts_at) <= now() then 'live'::text else p.status end as effective_status,
    w.starts_at as week_starts_at, w.ends_at as week_ends_at,
    p.launch_date
 from products p left join weeks w on w.id = p.week_id;

-- Calendar: how many launches each day holds, and who (approved ones only) is launching
create or replace function public.day_slots(d1 date, d2 date) returns table (day date, taken int, capacity int, launches jsonb)
language sql stable security definer set search_path = public as $$
  select g::date, (select count(*)::int from products p where p.launch_date = g::date and p.status in ('review','scheduled','live')),
         public.day_capacity(),
         coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'color', p.color, 'logo_url', p.logo_url) order by p.reviewed_at)
                   from products p where p.launch_date = g::date and p.status in ('scheduled','live')), '[]'::jsonb)
  from generate_series(d1, least(d2, d1 + 62), interval '1 day') g;
$$;
grant execute on function public.day_slots(date, date) to anon, authenticated;
grant execute on function public.lagos_today() to anon, authenticated;

-- Admin decisions carry the day; "Go live now" uses today
drop function if exists public.admin_review(uuid, text, text, jsonb, integer);
create or replace function public.admin_review(p uuid, decision text, note text default null, items jsonb default '[]'::jsonb, wk integer default null, day date default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare cur int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if decision not in ('scheduled','changes','rejected','live','review','archived','draft') then raise exception 'Unknown decision'; end if;
  if decision = 'live' then
    select id into cur from weeks where starts_at <= now() and ends_at > now() order by id limit 1;
    update products set status = 'live', launch_date = public.lagos_today(), week_id = coalesce(cur, week_id), review_note = note,
      review_items = coalesce(items, '[]'::jsonb), reviewed_at = now(), reviewed_by = auth.uid() where id = p;
    return;
  end if;
  update products set status = decision, review_note = note, review_items = coalesce(items,'[]'::jsonb),
    reviewed_at = now(), reviewed_by = auth.uid(),
    launch_date = case when decision = 'scheduled' then coalesce(day, launch_date) else launch_date end,
    week_id = case when decision = 'scheduled' and coalesce(day, launch_date) is null then coalesce(wk, week_id) else week_id end
  where id = p;
end $function$;
grant execute on function public.admin_review(uuid, text, text, jsonb, integer, date) to authenticated;

-- Existing launches get a day: live ones the day they went live, scheduled ones the Monday of their week
update products set launch_date = coalesce((reviewed_at at time zone 'Africa/Lagos')::date, lagos_today()) where status = 'live' and launch_date is null;
update products p set launch_date = (w.starts_at at time zone 'Africa/Lagos')::date from weeks w where p.status = 'scheduled' and p.launch_date is null and w.id = p.week_id;
