-- Founder badges (Figma 348:1520 · B1 Your badges, B2 Where badges show).
-- 14 badges in five areas, awarded automatically from what people actually did on Hentity.
-- badge_eval() is the single source of truth for every rule; badge_sync() turns it into rows in user_badges,
-- notifies on new badges and level-ups, and removes a badge when the thing behind it is gone.

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge text not null,
  level int not null default 1,
  stat int,
  ref text,
  earned_at timestamptz not null default now(),
  seen_at timestamptz,
  manual boolean not null default false,
  primary key (user_id, badge)
);
alter table public.user_badges enable row level security;   -- read through the functions below only
create index if not exists user_badges_badge on public.user_badges (badge);

-- Every badge, for one person: { key: { n, target, level, ok, at, ref, ... } }
create or replace function public.badge_eval(u uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb := '{}'; n int; t timestamptz; r text; x jsonb; today date := (now() at time zone 'Africa/Lagos')::date;
  req text[]; stg text; have int; miss text[];
begin
  -- Launch · First launch
  select count(*), min(coalesce(p.launch_date::timestamptz, p.reviewed_at, p.created_at)) into n, t from products p where p.owner_id = u and p.status = 'live';
  select p.name into r from products p where p.owner_id = u and p.status = 'live' order by coalesce(p.launch_date::timestamptz, p.reviewed_at, p.created_at) limit 1;
  out := out || jsonb_build_object('first_launch', jsonb_build_object('n', n, 'target', 1, 'ok', n >= 1, 'at', t, 'ref', r));

  -- Launch · Top of the day: most upvotes on its launch day (from other members, Lagos time), no tie, day over
  with d as (
    select p.id, p.owner_id, p.name, p.launch_date,
      (select count(*) from upvotes v where v.product_id = p.id and v.user_id is distinct from p.owner_id
         and (v.created_at at time zone 'Africa/Lagos')::date = p.launch_date) dv
    from products p where p.status = 'live' and not coalesce(p.promoted, false) and p.launch_date is not null and p.launch_date < today
      and p.launch_date in (select launch_date from products where owner_id = u and status = 'live')
  ), w as (
    select d.*, rank() over (partition by launch_date order by dv desc) rk, count(*) filter (where true) over (partition by launch_date, dv) ties from d
  )
  select count(*), min(launch_date)::timestamptz, (array_agg(name order by launch_date))[1], max(dv) into n, t, r, have
  from w where owner_id = u and rk = 1 and ties = 1 and dv >= 1;
  out := out || jsonb_build_object('top_day', jsonb_build_object('n', n, 'target', 1, 'ok', n >= 1, 'at', t, 'ref', r, 'votes', have));

  -- Launch · Shipper: product updates shipped on the roadmap · I 3, II 10, III 25
  select count(*), (array_agg(ri.shipped_at order by ri.shipped_at nulls last))[least(3, greatest(count(*), 1))::int] into n, t
  from roadmap_items ri join products p on p.id = ri.product_id where p.owner_id = u and ri.status = 'shipped';
  out := out || jsonb_build_object('shipper', jsonb_build_object('n', n, 'levels', '[3,10,25]'::jsonb, 'level', case when n >= 25 then 3 when n >= 10 then 2 when n >= 3 then 1 else 0 end, 'ok', n >= 3, 'at', t));

  -- Build and test · Idea tested
  select count(*), min(created_at) into n, t from idea_checks where user_id = u;
  out := out || jsonb_build_object('idea_tested', jsonb_build_object('n', n, 'target', 1, 'ok', n >= 1, 'at', t));

  -- Build and test · Beta host: one beta that 10 testers finished (sent their notes)
  select c, b.title, b.at into n, r, t from (
    select bb.id, coalesce(nullif(bb.title, ''), p.name) title, count(distinct f.application_id) c, max(f.created_at) at
    from betas bb left join products p on p.id = bb.product_id left join beta_feedback f on f.beta_id = bb.id
    where bb.owner_id = u group by 1, 2) b order by c desc limit 1;
  out := out || jsonb_build_object('beta_host', jsonb_build_object('n', coalesce(n, 0), 'target', 10, 'ok', coalesce(n, 0) >= 10, 'at', t, 'ref', r));

  -- Build and test · Good listener: 20 replies to reviews or beta notes
  select count(*), max(at) into n, t from (
    select maker_reply_at at from product_reviews where maker_reply_by = u and coalesce(maker_reply, '') <> ''
    union all select f.created_at from beta_feedback f join betas b on b.id = f.beta_id where b.owner_id = u and coalesce(f.maker_reply, '') <> '') x;
  select count(*) into have from product_reviews rv join products p on p.id = rv.product_id
    where p.owner_id = u and rv.user_id <> u and not coalesce(rv.hidden, false) and coalesce(rv.maker_reply, '') = '';
  out := out || jsonb_build_object('good_listener', jsonb_build_object('n', n, 'target', 20, 'ok', n >= 20, 'at', t, 'waiting', have));

  -- Community · First thread
  select count(*), min(created_at) into n, t from d_posts where author_id = u and not coalesce(hidden, false) and coalesce(status, '') not in ('removed', 'deleted', 'rejected');
  out := out || jsonb_build_object('first_thread', jsonb_build_object('n', n, 'target', 1, 'ok', n >= 1, 'at', t));

  -- Community · Helpful: upvotes on your answers from verified members, never your own · I 25, II 100, III 500
  select count(*) into n from d_votes v join d_comments c on c.id = v.comment_id join profiles pv on pv.id = v.user_id
    where c.author_id = u and v.value > 0 and v.user_id <> u and pv.is_verified and not coalesce(c.deleted, false);
  out := out || jsonb_build_object('helpful', jsonb_build_object('n', n, 'levels', '[25,100,500]'::jsonb, 'level', case when n >= 500 then 3 when n >= 100 then 2 when n >= 25 then 1 else 0 end, 'ok', n >= 25, 'at', null));

  -- Community · Reviewer: 5 reviews of other founders' products
  select count(*), max(rv.created_at) into n, t from product_reviews rv join products p on p.id = rv.product_id
    where rv.user_id = u and p.owner_id is distinct from u and not coalesce(rv.hidden, false);
  out := out || jsonb_build_object('reviewer', jsonb_build_object('n', n, 'target', 5, 'ok', n >= 5, 'at', t));

  -- Team and funding · Team builder: a Find match both sides opened up and made official with a trial
  select count(*), min(coalesce(m.revealed_at, m.created_at)) into n, t from find_matches m where m.poster = u and m.revealed_at is not null and m.trial is not null;
  out := out || jsonb_build_object('team_builder', jsonb_build_object('n', n, 'target', 1, 'ok', n >= 1, 'at', t));

  -- Team and funding · Room ready: every Required document for the round (lists match assets/dataroom.js)
  select stage into stg from dr_rooms where owner_id = u;
  req := case stg
    when 'ff' then array['deck','onepager','problem','usefunds','agreement']
    when 'seed' then array['deck','onepager','demo','traction','beta','model','burn','usefunds','cap','cac','founders','safes']
    when 'growth' then array['deck','demo','traction','beta','refs','kpis','model','burn','usefunds','mgmt','audited','bank','cap','cac','founders','esop','staff','board','safes','shareholders','articles','contracts','licences','tax','ip','privacy']
    else null end;
  if req is null then
    out := out || jsonb_build_object('room_ready', jsonb_build_object('n', 0, 'target', 0, 'ok', false, 'stage', null));
  else
    select count(distinct f.item), max(f.updated_at) into have, t from dr_files f join dr_rooms r2 on r2.id = f.room_id where r2.owner_id = u and f.item = any(req);
    select array(select k from unnest(req) k where not exists (select 1 from dr_files f join dr_rooms r2 on r2.id = f.room_id where r2.owner_id = u and f.item = k)) into miss;
    out := out || jsonb_build_object('room_ready', jsonb_build_object('n', have, 'target', cardinality(req), 'ok', have >= cardinality(req), 'at', t, 'stage', stg, 'missing', to_jsonb(miss)));
  end if;

  -- Team and funding · First investor: someone who confirmed their email opens your data room
  select count(*), min(s.created_at) into n, t from dr_sessions s join dr_links l on l.id = s.link_id join dr_rooms r2 on r2.id = l.room_id
    where r2.owner_id = u and s.verified and not s.is_owner and l.mode in ('email', 'list');
  out := out || jsonb_build_object('first_investor', jsonb_build_object('n', n, 'target', 1, 'ok', n >= 1, 'at', t));

  -- Hentity · Early builder: joined in Hentity's first year
  select created_at into t from profiles where id = u;
  out := out || jsonb_build_object('early_builder', jsonb_build_object('n', 1, 'target', 1, 'ok', t < timestamptz '2027-11-06 00:00+01', 'at', t));

  -- Hentity · Resource giver: given by the team when a suggested resource makes it into the library
  select count(*), min(earned_at) into n, t from user_badges where user_id = u and badge = 'resource_giver';
  out := out || jsonb_build_object('resource_giver', jsonb_build_object('n', n, 'target', 1, 'ok', n >= 1, 'at', t));
  return out;
end $$;

create or replace function public.badge_name(k text, lvl int default 1) returns text language sql immutable as $$
  select case k when 'first_launch' then 'First launch' when 'top_day' then 'Top of the day' when 'shipper' then 'Shipper' when 'idea_tested' then 'Idea tested'
    when 'beta_host' then 'Beta host' when 'good_listener' then 'Good listener' when 'first_thread' then 'First thread' when 'helpful' then 'Helpful'
    when 'reviewer' then 'Reviewer' when 'team_builder' then 'Team builder' when 'room_ready' then 'Room ready' when 'first_investor' then 'First investor'
    when 'early_builder' then 'Early builder' when 'resource_giver' then 'Resource giver' else k end
  || case when k in ('shipper', 'helpful') and lvl > 1 then ' · Level ' || repeat('I', lvl) else '' end;
$$;

-- Bring one person's badges up to date. Returns the badges that are new or levelled up.
create or replace function public.badge_sync(u uuid, notify boolean default true) returns text[]
language plpgsql security definer set search_path = public as $$
declare e jsonb; k text; v jsonb; lvl int; cur user_badges; fresh text[] := '{}'; banned boolean;
begin
  select coalesce(p.banned, false) into banned from profiles p where p.id = u;
  if banned is null then return fresh; end if;
  e := public.badge_eval(u);
  for k, v in select * from jsonb_each(e) loop
    lvl := greatest(1, coalesce((v ->> 'level')::int, 1));
    select * into cur from user_badges where user_id = u and badge = k;
    if (v ->> 'ok')::boolean and not banned then
      if cur.user_id is null then
        insert into user_badges (user_id, badge, level, stat, ref, earned_at)
        values (u, k, lvl, (v ->> 'n')::int, v ->> 'ref', coalesce((v ->> 'at')::timestamptz, now()));
        fresh := fresh || k;
      elsif lvl > cur.level then
        update user_badges set level = lvl, stat = (v ->> 'n')::int, seen_at = null, earned_at = now() where user_id = u and badge = k;
        fresh := fresh || k;
      else
        update user_badges set stat = (v ->> 'n')::int, ref = coalesce(v ->> 'ref', ref) where user_id = u and badge = k and (stat is distinct from (v ->> 'n')::int or ref is distinct from coalesce(v ->> 'ref', ref));
      end if;
    elsif cur.user_id is not null and not cur.manual and k <> 'early_builder' then
      delete from user_badges where user_id = u and badge = k;   -- the thing behind it is gone (or the account is banned)
    end if;
  end loop;
  if notify and cardinality(fresh) > 0 then
    insert into notifications (user_id, type, grp, title, body, link)
    values (u, 'badge', 'system',
      case when cardinality(fresh) = 1 then 'You earned a badge: ' || public.badge_name(fresh[1], (select level from user_badges where user_id = u and badge = fresh[1]))
           else 'You earned ' || cardinality(fresh) || ' badges' end,
      case when cardinality(fresh) = 1 then 'It’s on your profile now. Feature it or share it.'
           else (select string_agg(public.badge_name(b, (select level from user_badges where user_id = u and badge = b)), ', ') from unnest(fresh) b) || '.' end,
      '/badges');
  end if;
  return fresh;
end $$;

create or replace function public.badge_sync_all() returns int
language plpgsql security definer set search_path = public as $$
declare who record; c int := 0;
begin
  for who in select id from profiles where not coalesce(banned, false) loop
    c := c + cardinality(public.badge_sync(who.id, true));
  end loop;
  delete from user_badges ub using profiles pr where pr.id = ub.user_id and pr.banned;
  return c;
end $$;

-- Featured badges: picked by the founder, or the best three they hold
create or replace function public.badge_featured(u uuid) returns text[]
language sql stable security definer set search_path = public as $$
  with mine as (select badge from user_badges where user_id = u),
  picked as (select k from jsonb_array_elements_text(coalesce((select settings -> 'badges_featured' from profiles where id = u), '[]')) with ordinality j(k, o)
             where k in (select badge from mine) order by o)
  select coalesce(nullif(array(select k from picked limit 3), '{}'),
    array(select badge from mine order by array_position(array['top_day','beta_host','first_investor','shipper','helpful','room_ready','team_builder','good_listener','reviewer','first_launch','idea_tested','first_thread','resource_giver','early_builder'], badge) limit 3));
$$;

-- Your badges page: everything, with progress
create or replace function public.badge_me() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); e jsonb;
begin
  if u is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  perform public.badge_sync(u, true);
  e := public.badge_eval(u);
  return jsonb_build_object(
    'eval', e,
    'earned', (select coalesce(jsonb_object_agg(badge, jsonb_build_object('level', level, 'stat', stat, 'ref', ref, 'earned_at', earned_at)), '{}') from user_badges where user_id = u),
    'featured', to_jsonb(public.badge_featured(u)),
    'hidden', coalesce((select (settings ->> 'badges_hidden')::boolean from profiles where id = u), false),
    'holders', (select coalesce(jsonb_object_agg(badge, n), '{}') from (select badge, count(*) n from user_badges group by badge) x));
end $$;

-- Someone's public badges (earned only; nothing when they hide them)
create or replace function public.badge_public(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when coalesce((select (settings ->> 'badges_hidden')::boolean from profiles where id = uid), false) then jsonb_build_object('hidden', true, 'earned', '{}'::jsonb, 'featured', '[]'::jsonb)
  else jsonb_build_object('hidden', false,
    'earned', (select coalesce(jsonb_object_agg(badge, jsonb_build_object('level', level, 'stat', stat, 'ref', ref, 'earned_at', earned_at)), '{}') from user_badges where user_id = uid),
    'featured', to_jsonb(public.badge_featured(uid)),
    'holders', (select coalesce(jsonb_object_agg(badge, n), '{}') from (select badge, count(*) n from user_badges group by badge) x)) end;
$$;

-- The small mark next to names in Discuss: first featured badge, plus a few others
create or replace function public.badge_marks(uids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(p.id, jsonb_build_object(
    'top', f[1], 'level', (select level from user_badges where user_id = p.id and badge = f[1]),
    'stat', (select stat from user_badges where user_id = p.id and badge = f[1]), 'ref', (select ref from user_badges where user_id = p.id and badge = f[1]),
    'at', (select earned_at from user_badges where user_id = p.id and badge = f[1]),
    'others', to_jsonb(f[2:4]), 'total', (select count(*) from user_badges where user_id = p.id), 'username', p.username)), '{}')
  from profiles p, lateral (select public.badge_featured(p.id) f) x
  where p.id = any(uids) and not coalesce((p.settings ->> 'badges_hidden')::boolean, false) and cardinality(x.f) > 0;
$$;

create or replace function public.badge_set(featured text[] default null, hidden boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  if featured is not null then
    featured := array(select k from unnest(featured) with ordinality j(k, o) where k in (select badge from user_badges where user_id = auth.uid()) order by o limit 3);
    update profiles set settings = coalesce(settings, '{}') || jsonb_build_object('badges_featured', to_jsonb(featured)) where id = auth.uid();
  end if;
  if hidden is not null then update profiles set settings = coalesce(settings, '{}') || jsonb_build_object('badges_hidden', hidden) where id = auth.uid(); end if;
end $$;

create or replace function public.badge_seen(k text) returns void
language sql security definer set search_path = public as $$
  update user_badges set seen_at = now() where user_id = auth.uid() and badge = k and seen_at is null;
$$;

-- The team gives Resource giver by hand (and can take any badge away)
create or replace function public.badge_grant(uid uuid, k text, on_ boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
  if on_ then
    insert into user_badges (user_id, badge, manual) values (uid, k, true) on conflict (user_id, badge) do update set manual = true;
    insert into notifications (user_id, type, grp, title, body, link) values (uid, 'badge', 'system', 'You earned a badge: ' || public.badge_name(k), 'It’s on your profile now. Feature it or share it.', '/badges');
  else delete from user_badges where user_id = uid and badge = k; end if;
end $$;

-- Sidebar counts also carry the first badge you haven't seen, so the "new badge" sheet needs no extra request
create or replace function public.my_badges() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'notifications', (select count(*) from notifications where user_id = auth.uid() and read_at is null),
    'by_channel', coalesce((
      select jsonb_object_agg(channel_id, n) from (
        select cm.channel_id,
               (select count(*) from messages m
                 where m.channel_id = cm.channel_id and m.parent_id is null
                   and m.created_at > cm.last_read_at and m.user_id <> auth.uid()) as n
        from channel_members cm where cm.user_id = auth.uid()
      ) x where n > 0), '{}'::jsonb),
    'new_badge', (select jsonb_build_object('badge', badge, 'level', level, 'stat', stat, 'ref', ref, 'earned_at', earned_at,
        'featured', badge = any(public.badge_featured(auth.uid())))
      from user_badges where user_id = auth.uid() and seen_at is null order by earned_at desc limit 1)
  );
$$;

revoke execute on function public.badge_eval(uuid), public.badge_sync(uuid, boolean), public.badge_sync_all() from public, anon, authenticated;
grant execute on function public.badge_me(), public.badge_set(text[], boolean), public.badge_seen(text), public.badge_grant(uuid, text, boolean) to authenticated;
grant execute on function public.badge_public(uuid), public.badge_marks(uuid[]), public.badge_name(text, int) to anon, authenticated;
revoke execute on function public.badge_featured(uuid) from public, anon, authenticated;

-- Keep everyone's badges current (hourly)
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'hentity-badges';
  perform cron.schedule('hentity-badges', '17 * * * *', 'select public.badge_sync_all()');
end $$;

-- 074_badge_sync_all_fix (applied): the loop variable in badge_sync_all() is named `who`, not `p`,
-- so the clean-up delete no longer clashes with the profiles alias.
