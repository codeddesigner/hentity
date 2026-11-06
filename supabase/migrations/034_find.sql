-- Find (Figma: Find). Startups post roles (co-founder, full-time, part-time, contract, internship); people say
-- they're open to work. Interest is mutual before anyone's details or a chat opens. Every read goes through
-- security-definer functions that mask what the other side hasn't agreed to show (stealth, employer blocklist,
-- per-field privacy), so the raw tables are readable only by their owners.

-- ---------------------------------------------------------------- tables
create table if not exists public.find_roles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  startup_name text not null default '',
  startup_line text not null default '',          -- one line about the startup
  kind text not null default 'cofounder' check (kind in ('cofounder','fulltime','parttime','contract','internship')),
  area text not null default 'technical' check (area in ('technical','business','design','growth','operations','other')),
  title text not null check (char_length(title) between 3 and 90),
  owns text not null default '',                  -- what they'll own
  traction text not null default '',              -- where we are
  looking_for text not null default '',           -- who we're looking for
  skills text[] not null default '{}',
  category text not null default '',
  stage text not null default '',
  equity_min numeric, equity_max numeric,
  vesting text not null default '',
  pay text not null default 'equity' check (pay in ('equity','stipend','salary')),
  salary text not null default '',                -- shown as written, e.g. "₦900k–1.2M / month"
  duration text not null default '',              -- contracts and internships, e.g. "6 months"
  commitment text not null default 'fulltime' check (commitment in ('fulltime','parttime_first','flexible')),
  city text not null default '', country text not null default 'NG',
  working text not null default 'hybrid' check (working in ('onsite','hybrid','remote')),
  visibility text not null default 'stealth' check (visibility in ('public','stealth','invite')),
  nda boolean not null default true,
  verified_only boolean not null default false,
  hide_from text[] not null default '{}',
  questions jsonb not null default '[]'::jsonb,   -- ["Why does this problem matter to you?", ...]
  status text not null default 'open' check (status in ('draft','open','closed')),
  interest_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists find_roles_open_idx on public.find_roles (status, created_at desc);

create table if not exists public.find_profiles (
  user_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  open_to text[] not null default '{}',            -- cofounder, fulltime, parttime, contract, internship
  what text not null default '',                   -- "Product manager"
  experience text not null default '',             -- "6 years"
  seniority text not null default '',
  strengths text[] not null default '{}',
  looking_for text[] not null default '{}',        -- technical, business, design, growth, operations
  spaces text[] not null default '{}',             -- Fintech, Commerce, ...
  available text not null default 'now' check (available in ('now','3months','side')),
  wants text not null default '',                  -- free text: "a technical co-founder in fintech · from February"
  employer text not null default '',
  city text not null default '', country text not null default 'NG',
  mode text not null default 'stealth' check (mode in ('visible','stealth','paused')),
  show jsonb not null default '{"strangers":{"name":false,"employer":false,"links":false,"role":true,"skills":true,"city":true},"matches":{"name":true,"employer":true,"links":true,"role":true,"skills":true,"city":true}}'::jsonb,
  reach text not null default 'verified' check (reach in ('anyone','verified','founders')),
  nda boolean not null default true,
  ask_before_reveal boolean not null default true,
  hide_from text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- interest: a person says they're interested in a role; invite: a poster invites a person to a role
create table if not exists public.find_interests (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'interest' check (kind in ('interest','invite')),
  role_id uuid not null references public.find_roles(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  intro text not null default '' check (char_length(intro) <= 800),
  answers jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (role_id, from_user, to_user)
);
create index if not exists find_interests_to_idx on public.find_interests (to_user, status);
create index if not exists find_interests_from_idx on public.find_interests (from_user, created_at desc);

create table if not exists public.find_matches (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid unique references public.find_interests(id) on delete cascade,
  role_id uuid references public.find_roles(id) on delete set null,
  poster uuid not null references public.profiles(id) on delete cascade,
  candidate uuid not null references public.profiles(id) on delete cascade,
  nda_required boolean not null default false,
  poster_signed_at timestamptz, candidate_signed_at timestamptz,
  revealed_at timestamptz,
  fit jsonb not null default '{}'::jsonb,          -- {"poster": {"roles": "...", ...}, "candidate": {...}}
  trial jsonb,                                     -- {"scope","start","end","code_owner","by","at"}
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists find_matches_people_idx on public.find_matches (poster, candidate);

create table if not exists public.find_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.find_matches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists find_messages_match_idx on public.find_messages (match_id, created_at);

create table if not exists public.find_views (
  viewer uuid references public.profiles(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists find_views_user_idx on public.find_views (user_id, created_at desc);

-- ---------------------------------------------------------------- RLS: owners only; everything else via functions
alter table public.find_roles enable row level security;
alter table public.find_profiles enable row level security;
alter table public.find_interests enable row level security;
alter table public.find_matches enable row level security;
alter table public.find_messages enable row level security;
alter table public.find_views enable row level security;

drop policy if exists "roles own" on public.find_roles;
create policy "roles own" on public.find_roles for all using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid());
drop policy if exists "fprofile own" on public.find_profiles;
create policy "fprofile own" on public.find_profiles for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "interests mine" on public.find_interests;
create policy "interests mine" on public.find_interests for select using (from_user = auth.uid() or public.is_admin());
drop policy if exists "matches mine" on public.find_matches;
create policy "matches mine" on public.find_matches for select using (auth.uid() in (poster, candidate) or public.is_admin());
drop policy if exists "fmsg mine" on public.find_messages;
create policy "fmsg mine" on public.find_messages for select using (exists (select 1 from find_matches m where m.id = match_id and auth.uid() in (m.poster, m.candidate) and m.revealed_at is not null));
drop policy if exists "fviews none" on public.find_views;
create policy "fviews none" on public.find_views for select using (public.is_admin());

grant select, insert, update, delete on public.find_roles, public.find_profiles to authenticated;
grant select on public.find_interests, public.find_matches, public.find_messages to authenticated;

-- owners can't change counters or ownership
create or replace function public.guard_find_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then new.owner_id := auth.uid(); new.interest_count := 0; return new; end if;
  if current_setting('hentity.counter', true) = 'on' then return new; end if;
  new.owner_id := old.owner_id; new.interest_count := old.interest_count;
  return new;
end $$;
drop trigger if exists find_roles_guard on public.find_roles;
create trigger find_roles_guard before insert or update on public.find_roles for each row execute function public.guard_find_role();
drop trigger if exists feature_find_roles on public.find_roles;
create trigger feature_find_roles before insert on public.find_roles for each row execute function public.guard_feature('find', 'Find');
drop trigger if exists feature_find_profiles on public.find_profiles;
create trigger feature_find_profiles before insert on public.find_profiles for each row execute function public.guard_feature('find', 'Find');

-- ---------------------------------------------------------------- helpers
-- Is `viewer` someone the owner asked to be hidden from? Entries are company names or email domains.
create or replace function public.find_blocked(entries text[], viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer is not null and coalesce(cardinality(entries), 0) > 0 and exists (
    select 1 from unnest(entries) e, profiles v
    where v.id = viewer and trim(e) <> '' and (
      (position('.' in e) > 0 and lower(split_part(coalesce(v.email, ''), '@', 2)) in (lower(trim(e)), lower(regexp_replace(trim(e), '^.*·\s*', ''))))
      or (position('·' in e) > 0 and lower(split_part(coalesce(v.email, ''), '@', 2)) = lower(trim(split_part(e, '·', 2))))
      or exists (select 1 from find_profiles fp where fp.user_id = viewer and fp.employer <> '' and lower(fp.employer) = lower(trim(split_part(e, '·', 1))))
      or exists (select 1 from companies c where c.owner_id = viewer and lower(c.name) = lower(trim(split_part(e, '·', 1))))
      or exists (select 1 from products p where p.owner_id = viewer and lower(p.name) = lower(trim(split_part(e, '·', 1))))));
$$;

create or replace function public.find_matched(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from find_matches m where m.revealed_at is not null and ((m.poster = a and m.candidate = b) or (m.poster = b and m.candidate = a)));
$$;

create or replace function public.find_intros_left() returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, 5 - (select count(*)::int from find_interests where from_user = auth.uid() and created_at > now() - interval '7 days'));
$$;

-- What a viewer may see of a role
create or replace function public.find_role_json(r public.find_roles, viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare open boolean; o profiles; p products; mi find_interests; ints int; mt find_matches;
begin
  open := r.visibility = 'public' or r.owner_id = viewer or public.find_matched(r.owner_id, viewer) or public.is_admin();
  select * into o from profiles where id = r.owner_id;
  if r.product_id is not null then select * into p from products where id = r.product_id and status in ('scheduled','live','unclaimed'); end if;
  select * into mi from find_interests where role_id = r.id and ((from_user = viewer and to_user = r.owner_id) or (from_user = r.owner_id and to_user = viewer)) order by created_at desc limit 1;
  select * into mt from find_matches where role_id = r.id and candidate = viewer limit 1;
  return jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'area', r.area, 'title', r.title, 'owns', r.owns, 'looking_for', r.looking_for,
    'traction', case when open then r.traction else '' end, 'traction_hidden', not open and r.traction <> '',
    'skills', r.skills, 'category', r.category, 'stage', r.stage, 'equity_min', r.equity_min, 'equity_max', r.equity_max,
    'vesting', r.vesting, 'pay', r.pay, 'salary', r.salary, 'duration', r.duration, 'commitment', r.commitment,
    'city', r.city, 'country', r.country, 'working', r.working, 'visibility', r.visibility, 'nda', r.nda, 'verified_only', r.verified_only,
    'questions', r.questions, 'status', r.status, 'interest_count', r.interest_count, 'created_at', r.created_at,
    'stealth', not open, 'mine', r.owner_id = viewer,
    'startup', case when open then jsonb_build_object('name', coalesce(nullif(r.startup_name, ''), p.name, ''), 'line', coalesce(nullif(r.startup_line, ''), p.tagline, ''),
        'slug', p.slug, 'logo_url', p.logo_url, 'color', coalesce(p.color, '#111111'), 'verified', coalesce(p.verified, false))
      else jsonb_build_object('name', 'Stealth ' || lower(coalesce(nullif(r.category, ''), 'startup')), 'line', '', 'color', '#E4E4E7') end,
    'poster', case when open then jsonb_build_object('id', o.id, 'name', o.name, 'username', o.username, 'avatar_url', o.avatar_url, 'avatar_color', o.avatar_color, 'headline', o.headline, 'is_verified', o.is_verified)
      else jsonb_build_object('name', initcap(r.area) || ' founder') end,
    'my_interest', case when mi.id is null then null else jsonb_build_object('id', mi.id, 'kind', mi.kind, 'status', mi.status, 'mine', mi.from_user = viewer) end,
    'match_id', mt.id);
end $$;

-- What a viewer may see of a person
create or replace function public.find_person_json(f public.find_profiles, viewer uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u profiles; who text; s jsonb;
begin
  select * into u from profiles where id = f.user_id;
  who := case when f.user_id = viewer then 'self' when public.find_matched(f.user_id, viewer) then 'matches' when f.mode = 'visible' then 'visible' else 'strangers' end;
  s := case when who in ('self', 'visible') then '{"name":true,"employer":true,"links":true,"role":true,"skills":true,"city":true}'::jsonb else coalesce(f.show -> who, '{}'::jsonb) end;
  return jsonb_build_object('user_id', case when (s ->> 'name')::boolean then f.user_id end, 'key', md5(f.user_id::text || coalesce(viewer::text, '')),
    'stealth', not coalesce((s ->> 'name')::boolean, false), 'mode', case when who = 'self' then f.mode end,
    'name', case when (s ->> 'name')::boolean then u.name end, 'username', case when (s ->> 'name')::boolean then u.username end,
    'avatar_url', case when (s ->> 'name')::boolean then u.avatar_url end, 'avatar_color', case when (s ->> 'name')::boolean then u.avatar_color end,
    'employer', case when (s ->> 'employer')::boolean then f.employer end,
    'linkedin', case when (s ->> 'links')::boolean then u.linkedin end, 'website', case when (s ->> 'links')::boolean then u.website end,
    'what', case when coalesce((s ->> 'role')::boolean, true) then f.what end, 'experience', case when coalesce((s ->> 'role')::boolean, true) then f.experience end,
    'seniority', f.seniority,
    'strengths', case when coalesce((s ->> 'skills')::boolean, true) then to_jsonb(f.strengths) else '[]'::jsonb end,
    'spaces', case when coalesce((s ->> 'skills')::boolean, true) then to_jsonb(f.spaces) else '[]'::jsonb end,
    'city', case when coalesce((s ->> 'city')::boolean, true) then f.city end, 'country', f.country,
    'open_to', to_jsonb(f.open_to), 'looking_for', to_jsonb(f.looking_for), 'available', f.available, 'wants', f.wants,
    'verified', u.is_verified, 'updated_at', f.updated_at);
end $$;

-- ---------------------------------------------------------------- reads
create or replace function public.find_board(kinds text[] default null, q text default null, cat text default null, cc text default null, lim int default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.find_role_json(r, auth.uid()) order by r.created_at desc), '[]'::jsonb) from (
    select * from find_roles r
    where r.status = 'open' and (r.visibility <> 'invite' or r.owner_id = auth.uid())
      and not public.find_blocked(r.hide_from, auth.uid())
      and (kinds is null or cardinality(kinds) = 0 or r.kind = any(kinds))
      and (cat is null or cat = '' or r.category = cat) and (cc is null or cc = '' or r.country = cc)
      and (q is null or q = '' or r.title ilike '%' || q || '%' or array_to_string(r.skills, ' ') ilike '%' || q || '%'
           or (r.visibility = 'public' and r.startup_name ilike '%' || q || '%'))
      and not exists (select 1 from blocks b where (b.user_id = r.owner_id and b.blocked_id = auth.uid()) or (b.user_id = auth.uid() and b.blocked_id = r.owner_id))
    order by r.created_at desc limit least(lim, 200)) r;
$$;

create or replace function public.find_people(kinds text[] default null, q text default null, cc text default null, lim int default 60)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public.find_person_json(f, auth.uid()) order by f.updated_at desc), '[]'::jsonb) from (
    select f.* from find_profiles f join profiles u on u.id = f.user_id
    where f.mode <> 'paused' and not u.banned and f.user_id is distinct from auth.uid()
      and not public.find_blocked(f.hide_from, auth.uid())
      and (kinds is null or cardinality(kinds) = 0 or f.open_to && kinds)
      and (cc is null or cc = '' or f.country = cc)
      and (q is null or q = '' or f.what ilike '%' || q || '%' or array_to_string(f.strengths || f.spaces, ' ') ilike '%' || q || '%')
      and not exists (select 1 from blocks b where (b.user_id = f.user_id and b.blocked_id = auth.uid()) or (b.user_id = auth.uid() and b.blocked_id = f.user_id))
    order by f.updated_at desc limit least(lim, 200)) f;
$$;

create or replace function public.find_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'roles', (select count(*) from find_roles r where r.status = 'open' and r.visibility <> 'invite' and not public.find_blocked(r.hide_from, auth.uid())),
    'people', (select count(*) from find_profiles f where f.mode <> 'paused' and f.user_id is distinct from auth.uid() and not public.find_blocked(f.hide_from, auth.uid())),
    'matches', (select count(*) from find_matches m where auth.uid() in (m.poster, m.candidate))
      + (select count(*) from find_interests i where i.status = 'pending' and auth.uid() in (i.from_user, i.to_user)),
    'pending', (select count(*) from find_interests i where i.status = 'pending' and i.to_user = auth.uid()),
    'intros_left', public.find_intros_left());
$$;

create or replace function public.find_role(rid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r find_roles; out jsonb; team jsonb;
begin
  select * into r from find_roles where id = rid;
  if r.id is null or (r.status <> 'open' and r.owner_id is distinct from auth.uid() and not public.is_admin()) then return null; end if;
  if public.find_blocked(r.hide_from, auth.uid()) then return null; end if;
  if r.visibility = 'invite' and r.owner_id is distinct from auth.uid() and not exists (select 1 from find_interests i where i.role_id = r.id and auth.uid() in (i.from_user, i.to_user)) and not public.is_admin() then return null; end if;
  out := public.find_role_json(r, auth.uid());
  if not (out ->> 'stealth')::boolean and r.product_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('name', u.name, 'username', u.username, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'role', x.role, 'headline', u.headline)), '[]'::jsonb) into team
    from (select owner_id uid, 'Founder' role from products where id = r.product_id
          union all select user_id, coalesce(role, 'Maker') from product_makers where product_id = r.product_id and accepted) x join profiles u on u.id = x.uid;
  end if;
  return out || jsonb_build_object('team', coalesce(team, '[]'::jsonb), 'intros_left', public.find_intros_left(),
    'me', (select public.find_person_json(f, r.owner_id) from find_profiles f where f.user_id = auth.uid()));
end $$;

-- ---------------------------------------------------------------- write: interest, invite, decide
create or replace function public.find_note(uid uuid, t text, b text, lnk text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, grp, title, body, link, action_label) values (uid, 'find', 'system', t, b, lnk, 'Open');
$$;

create or replace function public.find_express(rid uuid, intro text, answers jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r find_roles; me profiles; iid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  if not public.feature_on('find') and not public.is_admin() then raise exception 'Find is turned off right now' using errcode = 'P0001'; end if;
  select * into r from find_roles where id = rid and status = 'open';
  if r.id is null or public.find_blocked(r.hide_from, auth.uid()) then raise exception 'This role isn''t open' using errcode = 'P0001'; end if;
  if r.owner_id = auth.uid() then raise exception 'This is your role' using errcode = 'P0001'; end if;
  select * into me from profiles where id = auth.uid();
  if r.verified_only and not me.is_verified then raise exception 'This role only takes replies from verified members' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(intro, ''))) < 20 then raise exception 'Write a short intro (a sentence or two)' using errcode = 'P0001'; end if;
  if exists (select 1 from find_interests where role_id = rid and from_user = auth.uid()) then raise exception 'You''ve already said you''re interested' using errcode = 'P0001'; end if;
  if public.find_intros_left() <= 0 then raise exception 'You''ve used your 5 intros this week. More open up in a few days.' using errcode = 'P0001'; end if;
  insert into find_interests (kind, role_id, from_user, to_user, intro, answers) values ('interest', rid, auth.uid(), r.owner_id, left(trim(intro), 800), coalesce(answers, '[]'::jsonb)) returning id into iid;
  perform set_config('hentity.counter', 'on', true);
  update find_roles set interest_count = interest_count + 1 where id = rid;
  perform set_config('hentity.counter', 'off', true);
  perform public.find_note(r.owner_id, 'Someone is interested in ' || r.title, left(trim(intro), 140), '/find/matches');
  return jsonb_build_object('id', iid, 'intros_left', public.find_intros_left());
end $$;

create or replace function public.find_invite(person_key text, rid uuid, intro text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r find_roles; f find_profiles; me profiles; iid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  select * into r from find_roles where id = rid and owner_id = auth.uid() and status = 'open';
  if r.id is null then raise exception 'Pick one of your open roles' using errcode = 'P0001'; end if;
  select * into f from find_profiles x where md5(x.user_id::text || auth.uid()::text) = person_key and x.mode <> 'paused';
  if f.user_id is null or public.find_blocked(f.hide_from, auth.uid()) then raise exception 'This person isn''t available' using errcode = 'P0001'; end if;
  select * into me from profiles where id = auth.uid();
  if f.reach = 'verified' and not me.is_verified then raise exception 'This person only hears from verified members' using errcode = 'P0001'; end if;
  if f.reach = 'founders' and not exists (select 1 from companies c where c.owner_id = auth.uid() and c.verified) then raise exception 'This person only hears from founders of verified startups' using errcode = 'P0001'; end if;
  if exists (select 1 from find_interests where role_id = rid and to_user = f.user_id) then raise exception 'You''ve already invited them to this role' using errcode = 'P0001'; end if;
  if public.find_intros_left() <= 0 then raise exception 'You''ve used your 5 intros this week. More open up in a few days.' using errcode = 'P0001'; end if;
  insert into find_interests (kind, role_id, from_user, to_user, intro) values ('invite', rid, auth.uid(), f.user_id, left(trim(coalesce(intro, '')), 800)) returning id into iid;
  insert into find_views (viewer, user_id) values (auth.uid(), f.user_id);
  perform public.find_note(f.user_id, 'You''re invited to a role: ' || r.title, left(trim(coalesce(intro, '')), 140), '/find/matches');
  return jsonb_build_object('id', iid, 'intros_left', public.find_intros_left());
end $$;

create or replace function public.find_view(person_key text) returns void
language sql security definer set search_path = public as $$
  insert into find_views (viewer, user_id) select auth.uid(), f.user_id from find_profiles f where md5(f.user_id::text || auth.uid()::text) = person_key and f.user_id <> auth.uid();
$$;

create or replace function public.find_decide(iid uuid, accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i find_interests; r find_roles; mid uuid; need boolean; poster uuid; cand uuid; fp find_profiles;
begin
  select * into i from find_interests where id = iid;
  if i.id is null or i.to_user <> auth.uid() then raise exception 'Not yours to answer' using errcode = 'P0001'; end if;
  if i.status <> 'pending' then raise exception 'Already answered' using errcode = 'P0001'; end if;
  update find_interests set status = case when accept then 'accepted' else 'declined' end, decided_at = now() where id = iid;
  if not accept then return jsonb_build_object('status', 'declined'); end if;
  select * into r from find_roles where id = i.role_id;
  poster := r.owner_id; cand := case when i.from_user = poster then i.to_user else i.from_user end;
  select * into fp from find_profiles where user_id = cand;
  need := r.nda or coalesce(fp.nda, false);
  insert into find_matches (interest_id, role_id, poster, candidate, nda_required, revealed_at)
  values (iid, r.id, poster, cand, need, case when need then null else now() end) returning id into mid;
  perform public.find_note(i.from_user, 'It''s a match: ' || r.title, case when need then 'Sign the mutual NDA to see each other.' else 'You can see each other now, and a chat is open.' end, '/find/m/' || mid);
  return jsonb_build_object('status', 'accepted', 'match_id', mid);
end $$;

create or replace function public.find_withdraw(iid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update find_interests set status = 'withdrawn', decided_at = now() where id = iid and from_user = auth.uid() and status = 'pending';
end $$;

-- ---------------------------------------------------------------- matches
create or replace function public.find_match(mid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m find_matches; r find_roles; other uuid; side text; fo find_profiles; i find_interests; u profiles; rev boolean;
begin
  select * into m from find_matches where id = mid;
  if m.id is null or auth.uid() not in (m.poster, m.candidate) then return null; end if;
  select * into r from find_roles where id = m.role_id;
  select * into i from find_interests where id = m.interest_id;
  side := case when auth.uid() = m.poster then 'poster' else 'candidate' end;
  other := case when side = 'poster' then m.candidate else m.poster end;
  rev := m.revealed_at is not null;
  select * into u from profiles where id = other;
  select * into fo from find_profiles where user_id = other;
  return jsonb_build_object('id', m.id, 'side', side, 'revealed', rev, 'nda_required', m.nda_required,
    'me_signed', case when side = 'poster' then m.poster_signed_at else m.candidate_signed_at end,
    'they_signed', case when side = 'poster' then m.candidate_signed_at else m.poster_signed_at end,
    'revealed_at', m.revealed_at, 'created_at', m.created_at, 'trial', m.trial,
    'role', case when r.id is null then null else public.find_role_json(r, auth.uid()) end,
    'intro', i.intro, 'answers', i.answers, 'intro_from_me', i.from_user = auth.uid(),
    'other', case when rev then jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'headline', u.headline,
        'linkedin', u.linkedin, 'website', u.website, 'what', fo.what, 'experience', fo.experience, 'employer', fo.employer, 'city', coalesce(nullif(fo.city, ''), u.city))
      else case when side = 'poster' and fo.user_id is not null then public.find_person_json(fo, auth.uid())
        else jsonb_build_object('name', case when side = 'poster' then 'Candidate' else (public.find_role_json(r, auth.uid()) -> 'poster' ->> 'name') end, 'stealth', true) end end,
    'fit_mine', coalesce(m.fit -> side, '{}'::jsonb),
    'fit_theirs', case when rev then (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(coalesce(m.fit -> (case when side = 'poster' then 'candidate' else 'poster' end), '{}'::jsonb)) t(k, v) where coalesce(m.fit -> side, '{}'::jsonb) ? k) else '{}'::jsonb end,
    'fit_theirs_count', (select count(*) from jsonb_object_keys(coalesce(m.fit -> (case when side = 'poster' then 'candidate' else 'poster' end), '{}'::jsonb))));
end $$;

-- inbox: matches plus pending intros either way
create or replace function public.find_inbox() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'at') desc), '[]'::jsonb) from (
    select jsonb_build_object('type', 'match', 'id', m.id, 'at', m.last_at, 'revealed', m.revealed_at is not null, 'nda_required', m.nda_required,
      'me_signed', case when auth.uid() = m.poster then m.poster_signed_at else m.candidate_signed_at end is not null,
      'title', r.title, 'startup', (public.find_role_json(r, auth.uid()) -> 'startup' ->> 'name'),
      'other', case when m.revealed_at is not null then (select jsonb_build_object('name', u.name, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color) from profiles u where u.id = case when auth.uid() = m.poster then m.candidate else m.poster end) else null end,
      'last', (select body from find_messages fm where fm.match_id = m.id order by created_at desc limit 1)) x
    from find_matches m left join find_roles r on r.id = m.role_id where auth.uid() in (m.poster, m.candidate)
    union all
    select jsonb_build_object('type', 'interest', 'id', i.id, 'at', i.created_at, 'kind', i.kind, 'incoming', i.to_user = auth.uid(), 'status', i.status,
      'title', r.title, 'role_id', r.id, 'startup', (public.find_role_json(r, auth.uid()) -> 'startup' ->> 'name'), 'intro', i.intro, 'answers', i.answers,
      'questions', r.questions,
      'person', case when i.to_user = auth.uid() then (select public.find_person_json(f, auth.uid()) from find_profiles f where f.user_id = i.from_user) end)
    from find_interests i join find_roles r on r.id = i.role_id
    where auth.uid() in (i.from_user, i.to_user) and i.status in ('pending', 'declined') and not exists (select 1 from find_matches m where m.interest_id = i.id)
  ) s(x);
$$;

create or replace function public.find_sign_nda(mid uuid, signed_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m find_matches; me profiles; side text; other uuid;
begin
  select * into m from find_matches where id = mid;
  if m.id is null or auth.uid() not in (m.poster, m.candidate) then raise exception 'Not your match' using errcode = 'P0001'; end if;
  select * into me from profiles where id = auth.uid();
  if lower(trim(coalesce(signed_name, ''))) <> lower(trim(me.name)) then raise exception 'Type your full name exactly as on your profile to sign' using errcode = 'P0001'; end if;
  side := case when auth.uid() = m.poster then 'poster' else 'candidate' end;
  other := case when side = 'poster' then m.candidate else m.poster end;
  if side = 'poster' then update find_matches set poster_signed_at = coalesce(poster_signed_at, now()) where id = mid;
  else update find_matches set candidate_signed_at = coalesce(candidate_signed_at, now()) where id = mid; end if;
  update find_matches set revealed_at = now(), last_at = now() where id = mid and revealed_at is null and poster_signed_at is not null and candidate_signed_at is not null;
  select * into m from find_matches where id = mid;
  perform public.find_note(other, case when m.revealed_at is not null then 'NDA signed by both. Names are revealed' else 'Your match signed the NDA' end,
    case when m.revealed_at is not null then 'Your private chat is open.' else 'Sign it too to see each other.' end, '/find/m/' || mid);
  return jsonb_build_object('revealed', m.revealed_at is not null);
end $$;

create or replace function public.find_send(mid uuid, body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m find_matches; msg find_messages; other uuid;
begin
  select * into m from find_matches where id = mid;
  if m.id is null or auth.uid() not in (m.poster, m.candidate) then raise exception 'Not your match' using errcode = 'P0001'; end if;
  if m.revealed_at is null then raise exception 'The chat opens once you can see each other' using errcode = 'P0001'; end if;
  insert into find_messages (match_id, user_id, body) values (mid, auth.uid(), left(trim(body), 4000)) returning * into msg;
  update find_matches set last_at = now() where id = mid;
  other := case when auth.uid() = m.poster then m.candidate else m.poster end;
  if not exists (select 1 from notifications n where n.user_id = other and n.link = '/find/m/' || mid and n.read_at is null and n.created_at > now() - interval '1 hour') then
    perform public.find_note(other, 'New message from your Find match', left(trim(body), 140), '/find/m/' || mid);
  end if;
  return to_jsonb(msg);
end $$;

create or replace function public.find_set_fit(mid uuid, answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m find_matches; side text;
begin
  select * into m from find_matches where id = mid;
  if m.id is null or auth.uid() not in (m.poster, m.candidate) then raise exception 'Not your match' using errcode = 'P0001'; end if;
  side := case when auth.uid() = m.poster then 'poster' else 'candidate' end;
  update find_matches set fit = jsonb_set(coalesce(fit, '{}'::jsonb), array[side], coalesce(answers, '{}'::jsonb), true) where id = mid;
end $$;

create or replace function public.find_set_trial(mid uuid, trial jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m find_matches;
begin
  select * into m from find_matches where id = mid;
  if m.id is null or auth.uid() not in (m.poster, m.candidate) or m.revealed_at is null then raise exception 'Not available' using errcode = 'P0001'; end if;
  update find_matches set trial = trial || jsonb_build_object('by', auth.uid(), 'at', now()), last_at = now() where id = mid;
  insert into find_messages (match_id, user_id, body) values (mid, auth.uid(), '📋 Trial planned: ' || coalesce(trial ->> 'scope', '') || ' · ' || coalesce(trial ->> 'start', '') || ' to ' || coalesce(trial ->> 'end', '') || ' · code owned by ' || coalesce(trial ->> 'code_owner', ''));
end $$;

-- privacy page numbers
create or replace function public.find_my_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('views', (select count(*) from find_views where user_id = auth.uid() and created_at > now() - interval '30 days'),
    'blocked', (select count(*) from blocks where user_id = auth.uid()));
$$;

create or replace function public.find_export() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('profile', (select to_jsonb(f) from find_profiles f where f.user_id = auth.uid()),
    'roles', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from find_roles r where r.owner_id = auth.uid()),
    'intros', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from find_interests i where auth.uid() in (i.from_user, i.to_user)),
    'matches', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'created_at', m.created_at, 'nda_required', m.nda_required, 'poster_signed_at', m.poster_signed_at, 'candidate_signed_at', m.candidate_signed_at, 'fit', m.fit, 'trial', m.trial,
       'messages', (select coalesce(jsonb_agg(jsonb_build_object('mine', fm.user_id = auth.uid(), 'body', fm.body, 'at', fm.created_at) order by fm.created_at), '[]'::jsonb) from find_messages fm where fm.match_id = m.id))), '[]'::jsonb)
       from find_matches m where auth.uid() in (m.poster, m.candidate)));
$$;

create or replace function public.find_delete_history() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from find_messages where user_id = auth.uid();
  delete from find_interests where from_user = auth.uid() or to_user = auth.uid();   -- removes matches without a signed NDA by cascade
  delete from find_profiles where user_id = auth.uid();
  delete from find_views where user_id = auth.uid() or viewer = auth.uid();
end $$;

grant execute on function public.find_board(text[], text, text, text, int), public.find_people(text[], text, text, int), public.find_counts(),
  public.find_role(uuid), public.find_express(uuid, text, jsonb), public.find_invite(text, uuid, text), public.find_view(text), public.find_decide(uuid, boolean),
  public.find_withdraw(uuid), public.find_match(uuid), public.find_inbox(), public.find_sign_nda(uuid, text), public.find_send(uuid, text),
  public.find_set_fit(uuid, jsonb), public.find_set_trial(uuid, jsonb), public.find_my_stats(), public.find_export(), public.find_delete_history(), public.find_intros_left() to authenticated;
grant execute on function public.find_board(text[], text, text, text, int), public.find_counts(), public.find_role(uuid) to anon;
revoke execute on function public.find_note(uuid, text, text, text), public.find_role_json(public.find_roles, uuid), public.find_person_json(public.find_profiles, uuid) from public, anon, authenticated;


-- a Find profile always belongs to whoever saves it
create or replace function public.guard_find_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then new.user_id := auth.uid(); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists find_profiles_guard on public.find_profiles;
create trigger find_profiles_guard before insert or update on public.find_profiles for each row execute function public.guard_find_profile();

-- live chat
do $$ begin
  alter publication supabase_realtime add table public.find_messages;
exception when others then null;
end $$;
