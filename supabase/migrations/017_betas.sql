-- Beta tests: makers post a call for testers, testers apply, makers pick, testers send feedback.
-- Perks are product perks only for now (no cash handling); perk_type keeps room for paid perks later.

-- Tester device, used to check platform requirements (private: only the owner reads it via my_profile)
alter table public.profiles add column if not exists device text default '';
alter table public.profiles add column if not exists device_os text default '';

create table if not exists public.betas (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 8 and 70),
  why text not null default '' check (char_length(why) <= 400),
  steps text[] not null default '{}',
  countries text[] not null default '{}',          -- country codes; empty = anywhere in Africa
  platforms text[] not null default '{}',          -- Android, iOS, Web, USSD / SMS, WhatsApp, API, Desktop
  requirements text[] not null default '{}',       -- free-text; testers confirm them when applying
  questions text[] not null default '{}',          -- up to 3 screening questions
  spots int not null default 20 check (spots between 1 and 2000),
  closes_at timestamptz not null,
  test_start date,
  test_end date,
  time_needed text not null default '20 min',
  access_methods text[] not null default '{}',     -- Play internal testing, TestFlight, APK download, Web link, Promo code
  nda boolean not null default false,
  perk_type text not null default 'none' check (perk_type in ('none','product')),
  perk text not null default '' check (char_length(perk) <= 120),
  status text not null default 'open' check (status in ('draft','open','closed','cancelled')),
  room_id uuid references public.channels(id) on delete set null,
  applied_count int not null default 0,
  accepted_count int not null default 0,
  feedback_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(steps) <= 6 and cardinality(questions) <= 3 and cardinality(requirements) <= 6)
);
create index if not exists betas_product on public.betas(product_id);
create index if not exists betas_status on public.betas(status, closes_at);

-- Private build links: only the maker, admins and accepted testers can read them
create table if not exists public.beta_access (
  beta_id uuid primary key references public.betas(id) on delete cascade,
  links jsonb not null default '[]'::jsonb       -- [{label, url}]
);

create table if not exists public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  beta_id uuid not null references public.betas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,     -- [{q, a}]
  confirmed text[] not null default '{}',          -- requirements the applicant says they meet
  device text not null default '',
  device_os text not null default '',
  share_email boolean not null default false,
  nda_ok boolean not null default false,
  status text not null default 'applied' check (status in ('applied','accepted','declined','waitlist','left')),
  match_score int not null default 0,
  match_total int not null default 0,
  tasks_done int[] not null default '{}',
  perk_released_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (beta_id, user_id)
);
create index if not exists beta_apps_beta on public.beta_applications(beta_id, status);

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  beta_id uuid not null references public.betas(id) on delete cascade,
  application_id uuid not null unique references public.beta_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ease int not null check (ease between 1 and 5),
  verdict text not null check (verdict in ('yes','mostly','no')),
  details text not null default '' check (char_length(details) <= 1000),
  extra text not null default '' check (char_length(extra) <= 500),
  media text[] not null default '{}',
  voice_url text,
  quote_ok boolean not null default false,
  tag text not null default '',
  fixed boolean not null default false,
  maker_reply text,
  created_at timestamptz not null default now()
);
create index if not exists beta_feedback_beta on public.beta_feedback(beta_id, created_at desc);

-- ------------------------------------------------------------ helpers
create or replace function public.owns_beta(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from betas where id = b and owner_id = auth.uid()) or public.is_admin();
$$;

create or replace function public.is_beta_tester(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from beta_applications where beta_id = b and user_id = auth.uid() and status = 'accepted');
$$;

create or replace function public.platform_of(device_os text, device text) returns text
language sql immutable as $$
  select case
    when coalesce(device_os,'') ~* 'android' then 'Android'
    when coalesce(device_os,'') ~* 'ios|iphone|ipad' or coalesce(device,'') ~* 'iphone|ipad' then 'iOS'
    when coalesce(device_os,'') ~* 'windows|mac|linux|chrome' or coalesce(device,'') ~* 'laptop|desktop|pc|mac' then 'Web'
    when coalesce(device,'') ~* 'feature phone|ussd' then 'USSD / SMS'
    else '' end
$$;

-- ------------------------------------------------------------ betas guard & counters
create or replace function public.guard_beta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if not public.is_admin() and not exists (select 1 from products where id = new.product_id and owner_id = auth.uid()) then
      raise exception 'You can only request testers for your own product' using errcode = 'P0001';
    end if;
    new.owner_id := coalesce((select owner_id from products where id = new.product_id), auth.uid());
    new.applied_count := 0; new.accepted_count := 0; new.feedback_count := 0;
    if new.closes_at <= now() then raise exception 'Pick a closing date in the future' using errcode = 'P0001'; end if;
    return new;
  end if;
  if current_setting('hentity.counter', true) = 'on' or public.is_admin() then return new; end if;
  new.owner_id := old.owner_id; new.product_id := old.product_id;
  new.applied_count := old.applied_count; new.accepted_count := old.accepted_count; new.feedback_count := old.feedback_count;
  return new;
end $$;
drop trigger if exists guard_beta on public.betas;
create trigger guard_beta before insert or update on public.betas for each row execute function public.guard_beta();

create or replace function public.beta_recount(b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('hentity.counter', 'on', true);
  update betas set
    applied_count = (select count(*) from beta_applications where beta_id = b and status <> 'left'),
    accepted_count = (select count(*) from beta_applications where beta_id = b and status = 'accepted'),
    feedback_count = (select count(*) from beta_feedback where beta_id = b)
  where id = b;
  perform set_config('hentity.counter', 'off', true);
end $$;

-- ------------------------------------------------------------ applications: match, waitlist, guard
create or replace function public.guard_beta_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare bt betas; pr profiles; plat text; score int := 0; total int := 0; r text;
begin
  select * into bt from betas where id = new.beta_id;
  if tg_op = 'UPDATE' and current_setting('hentity.counter', true) = 'on' then return new; end if;   -- system updates (perk release)
  if tg_op = 'INSERT' then
    if bt.status <> 'open' or bt.closes_at <= now() then raise exception 'This beta is no longer taking applications' using errcode = 'P0001'; end if;
    if bt.owner_id = auth.uid() then raise exception 'You can’t apply to your own beta' using errcode = 'P0001'; end if;
    new.user_id := auth.uid(); new.perk_released_at := null; new.decided_at := null; new.tasks_done := '{}';
    if exists (select 1 from profiles where id = auth.uid() and banned) then raise exception 'Your account can’t apply right now' using errcode = 'P0001'; end if;
    if bt.nda and not new.nda_ok then raise exception 'Please agree to keep this beta private' using errcode = 'P0001'; end if;
    new.status := case when bt.accepted_count >= bt.spots then 'waitlist' else 'applied' end;
  else
    if not public.owns_beta(old.beta_id) then
      -- testers may only leave, tick tasks, or update their own answers while still pending
      new.user_id := old.user_id; new.beta_id := old.beta_id; new.perk_released_at := old.perk_released_at; new.decided_at := old.decided_at;
      if new.status <> old.status and new.status <> 'left' then new.status := old.status; end if;
    else
      if new.status in ('accepted','declined') and new.status is distinct from old.status then new.decided_at := now(); end if;
      if new.status = 'accepted' and old.status <> 'accepted' and bt.accepted_count >= bt.spots then
        raise exception 'All % spots are filled. Add spots or decline someone first.', bt.spots using errcode = 'P0001';
      end if;
    end if;
  end if;
  -- match: country, platform, then each requirement the applicant confirmed
  select * into pr from profiles where id = new.user_id;
  total := 2 + coalesce(cardinality(bt.requirements), 0);
  if cardinality(bt.countries) = 0 or pr.country = any(bt.countries) then score := score + 1; end if;
  plat := public.platform_of(coalesce(nullif(new.device_os,''), pr.device_os), coalesce(nullif(new.device,''), pr.device));
  if cardinality(bt.platforms) = 0 or plat = any(bt.platforms) then score := score + 1; end if;
  foreach r in array coalesce(bt.requirements, '{}') loop
    if r = any(new.confirmed) then score := score + 1; end if;
  end loop;
  new.match_score := score; new.match_total := total;
  return new;
end $$;
drop trigger if exists guard_beta_application on public.beta_applications;
create trigger guard_beta_application before insert or update on public.beta_applications for each row execute function public.guard_beta_application();

create or replace function public.after_beta_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare bt betas; pname text; who text;
begin
  select * into bt from betas where id = coalesce(new.beta_id, old.beta_id);
  perform public.beta_recount(bt.id);
  if tg_op = 'DELETE' then return old; end if;
  select name into pname from products where id = bt.product_id;
  select name into who from profiles where id = new.user_id;
  if tg_op = 'INSERT' and bt.owner_id is not null then
    insert into notifications (user_id, type, grp, actor_id, product_id, title, body, link, action_label)
    values (bt.owner_id, 'beta_applied', 'launches', new.user_id, bt.product_id,
      '<b>' || h_esc(who) || '</b> applied to test ' || h_esc(pname), 'Match ' || new.match_score || '/' || new.match_total,
      '/betas/' || bt.id || '/manage', 'Review');
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'accepted' then
      insert into notifications (user_id, type, grp, product_id, title, body, link, action_label)
      values (new.user_id, 'beta_accepted', 'launches', bt.product_id,
        'You’re in! <b>' || h_esc(pname) || '</b> picked you to test', h_esc(bt.title), '/betas/' || bt.id, 'Get the beta');
      if bt.room_id is not null then
        insert into channel_members (channel_id, user_id) values (bt.room_id, new.user_id) on conflict do nothing;
      end if;
    elsif new.status = 'declined' then
      insert into notifications (user_id, type, grp, product_id, title, body, link)
      values (new.user_id, 'beta_declined', 'launches', bt.product_id,
        h_esc(pname) || ' filled its beta', 'Thanks for applying. You keep your place for their next beta.', '/betas');
      if bt.room_id is not null then delete from channel_members where channel_id = bt.room_id and user_id = new.user_id; end if;
    elsif new.status = 'left' and bt.room_id is not null then
      delete from channel_members where channel_id = bt.room_id and user_id = new.user_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists after_beta_application on public.beta_applications;
create trigger after_beta_application after insert or update or delete on public.beta_applications for each row execute function public.after_beta_application();

-- ------------------------------------------------------------ feedback
create or replace function public.guard_beta_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare app beta_applications;
begin
  if tg_op = 'INSERT' then
    select * into app from beta_applications where id = new.application_id;
    if app.user_id is distinct from auth.uid() or app.status <> 'accepted' then
      raise exception 'Only accepted testers can send feedback' using errcode = 'P0001';
    end if;
    new.user_id := auth.uid(); new.beta_id := app.beta_id; new.fixed := false; new.maker_reply := null;
    return new;
  end if;
  if public.owns_beta(old.beta_id) then
    -- makers can reply, tag and mark fixed, but not rewrite the tester's words
    new.ease := old.ease; new.verdict := old.verdict; new.details := old.details; new.extra := old.extra;
    new.media := old.media; new.voice_url := old.voice_url; new.user_id := old.user_id; new.application_id := old.application_id;
    return new;
  end if;
  raise exception 'Feedback can’t be edited after sending' using errcode = 'P0001';
end $$;
drop trigger if exists guard_beta_feedback on public.beta_feedback;
create trigger guard_beta_feedback before insert or update on public.beta_feedback for each row execute function public.guard_beta_feedback();

create or replace function public.after_beta_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare bt betas; pname text; who text;
begin
  select * into bt from betas where id = new.beta_id;
  perform set_config('hentity.counter', 'on', true);
  update beta_applications set perk_released_at = now(), tasks_done = (select array_agg(i) from generate_series(1, greatest(cardinality(bt.steps), 1)) i) where id = new.application_id;
  perform set_config('hentity.counter', 'off', true);
  perform public.beta_recount(bt.id);
  select name into pname from products where id = bt.product_id;
  select name into who from profiles where id = new.user_id;
  if bt.owner_id is not null then
    insert into notifications (user_id, type, grp, actor_id, product_id, title, body, link, action_label)
    values (bt.owner_id, 'beta_feedback', 'launches', new.user_id, bt.product_id,
      '<b>' || h_esc(who) || '</b> sent feedback on ' || h_esc(pname) || ' · ' || new.ease || '/5', left(h_esc(new.details), 140),
      '/betas/' || bt.id || '/manage?tab=feedback', 'Read');
  end if;
  if bt.perk_type = 'product' then
    insert into notifications (user_id, type, grp, product_id, title, body, link)
    values (new.user_id, 'beta_perk', 'launches', bt.product_id, 'Thanks for testing ' || h_esc(pname) || '!',
      'Your perk is unlocked: ' || h_esc(bt.perk) || '. ' || h_esc(pname) || ' will get it to you.', '/betas/' || bt.id);
  end if;
  return new;
end $$;
drop trigger if exists after_beta_feedback on public.beta_feedback;
create trigger after_beta_feedback after insert on public.beta_feedback for each row execute function public.after_beta_feedback();

-- ------------------------------------------------------------ private testers' room when a beta is created
create or replace function public.after_beta_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; pslug text; ch uuid;
begin
  select name, slug into pname, pslug from products where id = new.product_id;
  insert into channels (slug, name, description, kind, product_id, created_by, position)
  values (left(pslug, 40) || '-beta-' || left(new.id::text, 4), pname || ' beta testers', 'Private room for ' || pname || '’s beta testers and makers.', 'dm', new.product_id, new.owner_id, 200)
  returning id into ch;
  insert into channel_members (channel_id, user_id) values (ch, new.owner_id) on conflict do nothing;
  perform set_config('hentity.counter', 'on', true);
  update betas set room_id = ch where id = new.id;
  perform set_config('hentity.counter', 'off', true);
  insert into beta_access (beta_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists after_beta_insert on public.betas;
create trigger after_beta_insert after insert on public.betas for each row execute function public.after_beta_insert();

-- ------------------------------------------------------------ RLS
alter table public.betas enable row level security;
alter table public.beta_access enable row level security;
alter table public.beta_applications enable row level security;
alter table public.beta_feedback enable row level security;

drop policy if exists "betas visible" on public.betas;
create policy "betas visible" on public.betas for select using (status in ('open','closed') or owner_id = auth.uid() or public.is_admin());
drop policy if exists "betas create" on public.betas;
create policy "betas create" on public.betas for insert with check (auth.uid() is not null);
drop policy if exists "betas edit" on public.betas;
create policy "betas edit" on public.betas for update using (owner_id = auth.uid() or public.is_admin());
drop policy if exists "betas delete" on public.betas;
create policy "betas delete" on public.betas for delete using ((owner_id = auth.uid() and applied_count = 0) or public.is_admin());

drop policy if exists "beta access read" on public.beta_access;
create policy "beta access read" on public.beta_access for select using (public.owns_beta(beta_id) or public.is_beta_tester(beta_id));
drop policy if exists "beta access write" on public.beta_access;
create policy "beta access write" on public.beta_access for all using (public.owns_beta(beta_id)) with check (public.owns_beta(beta_id));

drop policy if exists "apps read" on public.beta_applications;
create policy "apps read" on public.beta_applications for select using (user_id = auth.uid() or public.owns_beta(beta_id));
drop policy if exists "apps create" on public.beta_applications;
create policy "apps create" on public.beta_applications for insert with check (auth.uid() is not null);
drop policy if exists "apps update" on public.beta_applications;
create policy "apps update" on public.beta_applications for update using (user_id = auth.uid() or public.owns_beta(beta_id));

drop policy if exists "feedback read" on public.beta_feedback;
create policy "feedback read" on public.beta_feedback for select using (user_id = auth.uid() or public.owns_beta(beta_id));
drop policy if exists "feedback create" on public.beta_feedback;
create policy "feedback create" on public.beta_feedback for insert with check (auth.uid() is not null);
drop policy if exists "feedback update" on public.beta_feedback;
create policy "feedback update" on public.beta_feedback for update using (public.owns_beta(beta_id));

-- ------------------------------------------------------------ RPCs
-- Board header numbers, all real
create or replace function public.beta_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select count(*) from betas where status = 'open' and closes_at > now()),
    'match', (select count(*) from betas b, profiles p where p.id = auth.uid() and b.status = 'open' and b.closes_at > now()
              and (cardinality(b.countries) = 0 or p.country = any(b.countries))
              and (cardinality(b.platforms) = 0 or public.platform_of(p.device_os, p.device) = any(b.platforms))),
    'testers_month', (select count(*) from beta_applications where status = 'accepted' and decided_at >= date_trunc('month', now())),
    'perks', (select count(*) from beta_applications where perk_released_at is not null)
  );
$$;

-- Rough audience for the request form: members per selected country
create or replace function public.beta_reach(cs text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(country, n), '{}'::jsonb) from (
    select country, count(*) n from profiles where not banned and (cardinality(cs) = 0 or country = any(cs)) group by country
  ) t;
$$;

-- Accept the N best pending applicants (full matches first, oldest first)
create or replace function public.beta_accept_best(b uuid, n int) returns int
language plpgsql security definer set search_path = public as $$
declare bt betas; take int; done int := 0; a record;
begin
  if not public.owns_beta(b) then raise exception 'Only the maker can pick testers'; end if;
  select * into bt from betas where id = b;
  take := least(n, bt.spots - bt.accepted_count);
  for a in select id from beta_applications where beta_id = b and status in ('applied','waitlist')
           order by (match_score::float / greatest(match_total, 1)) desc, created_at asc limit greatest(take, 0) loop
    update beta_applications set status = 'accepted' where id = a.id; done := done + 1;
  end loop;
  return done;
end $$;

-- Maker view: applicants with the public bits of their profile (and email only if they agreed to share it)
create or replace function public.beta_applicants(b uuid) returns table (
  id uuid, user_id uuid, name text, username text, avatar_url text, avatar_color text, country text, city text,
  device text, device_os text, answers jsonb, confirmed text[], status text, match_score int, match_total int,
  tasks_done int[], perk_released_at timestamptz, created_at timestamptz, email text, has_feedback boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.user_id, p.name, p.username, p.avatar_url, p.avatar_color, p.country, p.city,
         coalesce(nullif(a.device,''), p.device), coalesce(nullif(a.device_os,''), p.device_os), a.answers, a.confirmed, a.status,
         a.match_score, a.match_total, a.tasks_done, a.perk_released_at, a.created_at,
         case when a.share_email and a.status = 'accepted' then p.email end,
         exists (select 1 from beta_feedback f where f.application_id = a.id)
  from beta_applications a join profiles p on p.id = a.user_id
  where a.beta_id = b and public.owns_beta(b)
  order by (a.status = 'accepted') desc, (a.match_score::float / greatest(a.match_total, 1)) desc, a.created_at;
$$;

create or replace function public.beta_feedback_list(b uuid) returns table (
  id uuid, user_id uuid, name text, username text, avatar_url text, avatar_color text, country text, city text, device text,
  ease int, verdict text, details text, extra text, media text[], voice_url text, quote_ok boolean, tag text, fixed boolean,
  maker_reply text, created_at timestamptz, perk_released boolean)
language sql stable security definer set search_path = public as $$
  select f.id, f.user_id, p.name, p.username, p.avatar_url, p.avatar_color, p.country, p.city,
         coalesce(nullif(a.device,''), p.device), f.ease, f.verdict, f.details, f.extra, f.media, f.voice_url, f.quote_ok, f.tag, f.fixed,
         f.maker_reply, f.created_at, a.perk_released_at is not null
  from beta_feedback f join beta_applications a on a.id = f.application_id join profiles p on p.id = f.user_id
  where f.beta_id = b and public.owns_beta(b)
  order by f.created_at desc;
$$;

grant execute on function public.beta_stats() to anon, authenticated;
grant execute on function public.beta_reach(text[]) to authenticated;
grant execute on function public.beta_accept_best(uuid, int) to authenticated;
grant execute on function public.beta_applicants(uuid) to authenticated;
grant execute on function public.beta_feedback_list(uuid) to authenticated;
grant select on public.betas to anon, authenticated;
grant insert, update, delete on public.betas to authenticated;
grant select, insert, update on public.beta_applications, public.beta_feedback, public.beta_access to authenticated;
revoke execute on function public.guard_beta(), public.guard_beta_application(), public.after_beta_application(),
  public.guard_beta_feedback(), public.after_beta_feedback(), public.after_beta_insert(), public.beta_recount(uuid) from public, anon, authenticated;

alter publication supabase_realtime add table public.betas, public.beta_applications;
