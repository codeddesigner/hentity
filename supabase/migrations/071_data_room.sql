-- Data room (Figma: Studio → Data room 105:1630, 302:3757, 304:3901, 228:3074, 229:3260, 228:3543)
-- One room per founder, set up for a funding stage. Files live in the private 'dataroom' bucket under
-- <owner id>/<room id>/... Founders share them through links (whole room or chosen files) that can ask for
-- a verified email (6-digit code), an allow-list, expiry, watermark and slide-by-slide tracking.
-- Viewers never get a storage policy of their own: opening a link writes short-lived grants for exactly the
-- files that link covers, and the bucket's read policy only honours those grants.

create table if not exists public.dr_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null default '',
  stage text not null default 'seed' check (stage in ('ff', 'seed', 'growth')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.dr_files (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.dr_rooms(id) on delete cascade,
  item text not null default '',            -- checklist item this file fills ('' = extra file)
  folder text not null default 'other',
  name text not null, path text not null unique, size bigint not null default 0, mime text not null default '',
  pages int, version int not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists dr_files_room on public.dr_files(room_id);

create table if not exists public.dr_links (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.dr_rooms(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  label text not null default '',
  file_ids uuid[],                           -- null = the whole room
  mode text not null default 'email' check (mode in ('anyone', 'email', 'list')),
  allow text[] not null default '{}',        -- emails or @domains for 'list'
  download boolean not null default false, watermark boolean not null default true, track boolean not null default true,
  expires_at timestamptz, revoked_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists dr_links_room on public.dr_links(room_id);

create table if not exists public.dr_codes (
  link_id uuid not null references public.dr_links(id) on delete cascade,
  email text not null, code_hash text not null, tries int not null default 0,
  expires_at timestamptz not null, created_at timestamptz not null default now(),
  primary key (link_id, email));

create table if not exists public.dr_sessions (
  id uuid primary key default gen_random_uuid(),
  secret text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  link_id uuid not null references public.dr_links(id) on delete cascade,
  email text not null default '', verified boolean not null default false,
  device text not null default '', created_at timestamptz not null default now(), last_at timestamptz not null default now());
create index if not exists dr_sessions_link on public.dr_sessions(link_id);

create table if not exists public.dr_views (
  session_id uuid not null references public.dr_sessions(id) on delete cascade,
  file_id uuid not null references public.dr_files(id) on delete cascade,
  page int not null default 1, seconds numeric not null default 0, opens int not null default 1,
  first_at timestamptz not null default now(), last_at timestamptz not null default now(),
  primary key (session_id, file_id, page));
create index if not exists dr_views_file on public.dr_views(file_id);

create table if not exists public.dr_grants (
  path text not null, session_id uuid not null references public.dr_sessions(id) on delete cascade,
  until timestamptz not null, primary key (path, session_id));

alter table public.dr_rooms enable row level security;
alter table public.dr_files enable row level security;
alter table public.dr_links enable row level security;
alter table public.dr_codes enable row level security;
alter table public.dr_sessions enable row level security;
alter table public.dr_views enable row level security;
alter table public.dr_grants enable row level security;
-- Owners read their own rows directly; everything else goes through the functions below
drop policy if exists "dr rooms own" on public.dr_rooms;
create policy "dr rooms own" on public.dr_rooms for select using (owner_id = auth.uid());
drop policy if exists "dr files own" on public.dr_files;
create policy "dr files own" on public.dr_files for select using (exists (select 1 from dr_rooms r where r.id = room_id and r.owner_id = auth.uid()));
drop policy if exists "dr links own" on public.dr_links;
create policy "dr links own" on public.dr_links for select using (exists (select 1 from dr_rooms r where r.id = room_id and r.owner_id = auth.uid()));
grant select on public.dr_rooms, public.dr_files, public.dr_links to authenticated;

-- Storage: owners manage their own folder; viewers read only what an open link has granted them
insert into storage.buckets (id, name, public, file_size_limit) values ('dataroom', 'dataroom', false, 52428800) on conflict (id) do nothing;
drop policy if exists "dataroom own read" on storage.objects;
create policy "dataroom own read" on storage.objects for select to authenticated using (bucket_id = 'dataroom' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dataroom own upload" on storage.objects;
create policy "dataroom own upload" on storage.objects for insert to authenticated with check (bucket_id = 'dataroom' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dataroom own update" on storage.objects;
create policy "dataroom own update" on storage.objects for update to authenticated using (bucket_id = 'dataroom' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dataroom own delete" on storage.objects;
create policy "dataroom own delete" on storage.objects for delete to authenticated using (bucket_id = 'dataroom' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "dataroom granted read" on storage.objects;
create or replace function public.dr_granted(p text) returns boolean
language sql stable security definer set search_path = public as $$ select exists (select 1 from dr_grants g where g.path = p and g.until > now()); $$;
grant execute on function public.dr_granted(text) to anon, authenticated;
create policy "dataroom granted read" on storage.objects for select to anon, authenticated using (bucket_id = 'dataroom' and public.dr_granted(name));

-- ---------------------------------------------------------------- owner side
create or replace function public.dr_my_room() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r dr_rooms;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  select * into r from dr_rooms where owner_id = auth.uid();
  if r.id is null then
    return jsonb_build_object('room', null, 'products', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'stage', p.stage, 'logo_url', p.logo_url, 'color', p.color) order by p.created_at desc), '[]') from products p where p.owner_id = auth.uid() and p.status in ('live', 'scheduled', 'review', 'changes')));
  end if;
  return jsonb_build_object(
    'room', to_jsonb(r) || jsonb_build_object('product', (select jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'stage', p.stage, 'logo_url', p.logo_url, 'color', p.color) from products p where p.id = r.product_id)),
    'files', (select coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('views', (select count(distinct v.session_id) from dr_views v where v.file_id = f.id)) order by f.created_at), '[]') from dr_files f where f.room_id = r.id),
    'links', (select coalesce(jsonb_agg(to_jsonb(l) || jsonb_build_object(
        'viewers', (select count(*) from dr_sessions s where s.link_id = l.id and (s.verified or l.mode = 'anyone')),
        'last_view', (select max(s.last_at) from dr_sessions s where s.link_id = l.id)) order by l.created_at desc), '[]') from dr_links l where l.room_id = r.id),
    'products', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'stage', p.stage, 'logo_url', p.logo_url, 'color', p.color) order by p.created_at desc), '[]') from products p where p.owner_id = auth.uid() and p.status in ('live', 'scheduled', 'review', 'changes')));
end $$;

create or replace function public.dr_setup(stg text, pid uuid, nm text) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  if not public.feature_on('dataroom') and not public.is_admin() then raise exception 'The data room is turned off right now' using errcode = 'P0001'; end if;
  if stg not in ('ff', 'seed', 'growth') then raise exception 'Pick a stage' using errcode = 'P0001'; end if;
  if pid is not null and not exists (select 1 from products where id = pid and owner_id = auth.uid()) then pid := null; end if;
  insert into dr_rooms (owner_id, product_id, name, stage) values (auth.uid(), pid, left(trim(coalesce(nm, '')), 120), stg)
  on conflict (owner_id) do update set stage = excluded.stage, product_id = coalesce(excluded.product_id, dr_rooms.product_id),
    name = case when excluded.name <> '' then excluded.name else dr_rooms.name end, updated_at = now()
  returning id into rid;
  return rid;
end $$;

create or replace function public.dr_add_file(itm text, fld text, nm text, pth text, sz bigint, mt text, pg int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r dr_rooms; f dr_files; old dr_files;
begin
  select * into r from dr_rooms where owner_id = auth.uid();
  if r.id is null then raise exception 'Set up your data room first' using errcode = 'P0001'; end if;
  if split_part(coalesce(pth, ''), '/', 1) <> auth.uid()::text or split_part(pth, '/', 2) <> r.id::text then raise exception 'Upload went to the wrong place' using errcode = 'P0001'; end if;
  itm := left(coalesce(itm, ''), 60);
  -- A checklist item holds one file: a new upload replaces it and bumps the version
  if itm <> '' then select * into old from dr_files where room_id = r.id and item = itm order by created_at desc limit 1; end if;
  if old.id is not null then
    update dr_files set name = left(nm, 200), path = pth, size = coalesce(sz, 0), mime = left(coalesce(mt, ''), 120), pages = pg, version = version + 1, updated_at = now() where id = old.id returning * into f;
    delete from dr_grants where path = old.path;
  else
    insert into dr_files (room_id, item, folder, name, path, size, mime, pages) values (r.id, itm, left(coalesce(nullif(fld, ''), 'other'), 40), left(nm, 200), pth, coalesce(sz, 0), left(coalesce(mt, ''), 120), pg) returning * into f;
  end if;
  update dr_rooms set updated_at = now() where id = r.id;
  return to_jsonb(f) || jsonb_build_object('old_path', old.path);   -- the app removes the replaced file from storage
end $$;

create or replace function public.dr_delete_file(fid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare f dr_files;
begin
  select f2.* into f from dr_files f2 join dr_rooms r on r.id = f2.room_id where f2.id = fid and r.owner_id = auth.uid();
  if f.id is null then raise exception 'File not found' using errcode = 'P0001'; end if;
  delete from dr_grants where path = f.path;
  delete from dr_files where id = f.id;
  update dr_links set file_ids = array_remove(file_ids, f.id) where file_ids is not null and f.id = any(file_ids);
  return f.path;   -- the app removes it from storage
end $$;

create or replace function public.dr_rename_file(fid uuid, nm text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(nm, ''))) < 1 then raise exception 'Add a name' using errcode = 'P0001'; end if;
  update dr_files f set name = left(trim(nm), 200), updated_at = now() from dr_rooms r where f.id = fid and r.id = f.room_id and r.owner_id = auth.uid();
end $$;

create or replace function public.dr_save_link(lid uuid, lbl text, fids uuid[], md text, allw text[], dl boolean, wm boolean, trk boolean, exp timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r dr_rooms; l dr_links;
begin
  select * into r from dr_rooms where owner_id = auth.uid();
  if r.id is null then raise exception 'Set up your data room first' using errcode = 'P0001'; end if;
  if md not in ('anyone', 'email', 'list') then raise exception 'Pick who can open the link' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(lbl, ''))) < 2 then raise exception 'Name the link, e.g. the investor it''s for' using errcode = 'P0001'; end if;
  allw := array(select distinct lower(trim(x)) from unnest(coalesce(allw, '{}')) x where trim(x) ~ '^[^\s@]*@[^\s@]+\.[^\s@]+$');
  if md = 'list' and cardinality(allw) = 0 then raise exception 'Add at least one email or @domain' using errcode = 'P0001'; end if;
  fids := case when fids is null or cardinality(fids) = 0 then null else array(select id from dr_files where room_id = r.id and id = any(fids)) end;
  if lid is null then
    insert into dr_links (room_id, label, file_ids, mode, allow, download, watermark, track, expires_at)
    values (r.id, left(trim(lbl), 80), fids, md, allw, coalesce(dl, false), coalesce(wm, true), coalesce(trk, true), exp) returning * into l;
  else
    update dr_links set label = left(trim(lbl), 80), file_ids = fids, mode = md, allow = allw, download = coalesce(dl, false), watermark = coalesce(wm, true), track = coalesce(trk, true), expires_at = exp
    where id = lid and room_id = r.id returning * into l;
    if l.id is null then raise exception 'Link not found' using errcode = 'P0001'; end if;
  end if;
  return to_jsonb(l);
end $$;

create or replace function public.dr_revoke_link(lid uuid, on_ boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  update dr_links l set revoked_at = case when on_ then now() else null end from dr_rooms r where l.id = lid and r.id = l.room_id and r.owner_id = auth.uid();
  if on_ then delete from dr_grants g using dr_sessions s where g.session_id = s.id and s.link_id = lid; end if;
end $$;

-- Analytics for one file, or the whole room (fid null). Optional link filter.
create or replace function public.dr_analytics(fid uuid default null, lid uuid default null, ndays int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r dr_rooms; since timestamptz := now() - greatest(1, least(coalesce(ndays, 30), 3650)) * interval '1 day';
begin
  select * into r from dr_rooms where owner_id = auth.uid();
  if r.id is null then return null; end if;
  return (with v as (
      select v.*, s.email, s.verified, s.device, s.link_id, l.label, l.mode from dr_views v
      join dr_sessions s on s.id = v.session_id join dr_links l on l.id = s.link_id join dr_files f on f.id = v.file_id
      where f.room_id = r.id and (fid is null or v.file_id = fid) and (lid is null or s.link_id = lid) and v.last_at >= since),
    per as (select session_id, max(email) email, bool_or(verified) verified, max(device) device, max(label) label, max(mode) mode,
              sum(seconds) secs, count(distinct page) pages, sum(opens) opens, max(last_at) last_at from v group by session_id)
    select jsonb_build_object(
      'views', (select coalesce(sum(opens), 0) from per),
      'views_week', (select count(*) from v where v.first_at > now() - interval '7 days' and v.page = 1),
      'people', (select count(distinct case when email <> '' then email else session_id::text end) from per),
      'verified', (select count(distinct email) from per where verified and email <> ''),
      'avg_secs', (select coalesce(round(avg(secs)), 0) from per),
      'median_secs', (select coalesce(round((percentile_cont(0.5) within group (order by secs))::numeric), 0) from per),
      'pages', (select coalesce(jsonb_agg(jsonb_build_object('page', page, 'avg', round(s / greatest(n, 1), 1), 'reach', n) order by page), '[]')
                from (select page, sum(seconds) s, count(distinct session_id) n from v group by page) x),
      'sessions', (select count(*) from per),
      'viewers', (select coalesce(jsonb_agg(jsonb_build_object('email', email, 'verified', verified, 'device', device, 'label', label, 'mode', mode,
                    'secs', round(secs), 'pages', pages, 'opens', opens, 'last_at', last_at) order by last_at desc), '[]') from per)));
end $$;

grant execute on function public.dr_my_room(), public.dr_setup(text, uuid, text), public.dr_add_file(text, text, text, text, bigint, text, int),
  public.dr_delete_file(uuid), public.dr_rename_file(uuid, text), public.dr_save_link(uuid, text, uuid[], text, text[], boolean, boolean, boolean, timestamptz),
  public.dr_revoke_link(uuid, boolean), public.dr_analytics(uuid, uuid, int) to authenticated;
revoke execute on function public.dr_my_room(), public.dr_setup(text, uuid, text), public.dr_add_file(text, text, text, text, bigint, text, int),
  public.dr_delete_file(uuid), public.dr_rename_file(uuid, text), public.dr_save_link(uuid, text, uuid[], text, text[], boolean, boolean, boolean, timestamptz),
  public.dr_revoke_link(uuid, boolean), public.dr_analytics(uuid, uuid, int) from anon;

-- ---------------------------------------------------------------- viewer side (anyone with the link)
create or replace function public.dr_link_ok(l dr_links) returns boolean language sql stable as $$
  select l.id is not null and l.revoked_at is null and (l.expires_at is null or l.expires_at > now());
$$;

-- What the gate shows before anything is opened
create or replace function public.dr_open(tok text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare l dr_links; r dr_rooms; p products; o profiles; n int; deck dr_files;
begin
  select * into l from dr_links where token = tok;
  if not public.dr_link_ok(l) then return jsonb_build_object('ok', false, 'reason', case when l.id is null then 'missing' when l.revoked_at is not null then 'revoked' else 'expired' end); end if;
  select * into r from dr_rooms where id = l.room_id; select * into p from products where id = r.product_id; select * into o from profiles where id = r.owner_id;
  select count(*) into n from dr_files f where f.room_id = r.id and (l.file_ids is null or f.id = any(l.file_ids));
  select * into deck from dr_files f where f.room_id = r.id and (l.file_ids is null or f.id = any(l.file_ids)) order by (f.item = 'deck') desc, f.created_at limit 1;
  return jsonb_build_object('ok', true, 'company', coalesce(nullif(r.name, ''), p.name, o.name), 'logo_url', p.logo_url, 'color', coalesce(p.color, '#0a0a0a'),
    'label', l.label, 'mode', l.mode, 'download', l.download, 'watermark', l.watermark, 'track', l.track, 'files', n,
    'single', case when l.file_ids is not null and cardinality(l.file_ids) = 1 then jsonb_build_object('name', deck.name, 'pages', deck.pages) end);
end $$;

-- Email a 6-digit code (verified-email and allow-list links)
create or replace function public.dr_request_code(tok text, em text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare l dr_links; r dr_rooms; co text; code text; recent int; nm text;
begin
  select * into l from dr_links where token = tok;
  if not public.dr_link_ok(l) then raise exception 'This link isn''t active any more' using errcode = 'P0001'; end if;
  em := lower(trim(coalesce(em, '')));
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email' using errcode = 'P0001'; end if;
  if l.mode = 'list' and not exists (select 1 from unnest(l.allow) a where a = em or (a like '@%' and em like '%' || a)) then
    raise exception 'This link is only for people the founder added. Ask them to add your email.' using errcode = 'P0001'; end if;
  select count(*) into recent from dr_codes where email = em and created_at > now() - interval '10 minutes';
  if recent >= 5 then raise exception 'Too many codes. Try again in a few minutes.' using errcode = 'P0001'; end if;
  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into dr_codes (link_id, email, code_hash, expires_at) values (l.id, em, encode(extensions.digest(code || l.token, 'sha256'), 'hex'), now() + interval '15 minutes')
  on conflict (link_id, email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, created_at = now();
  select * into r from dr_rooms where id = l.room_id;
  select coalesce(nullif(r.name, ''), (select name from products where id = r.product_id), (select name from profiles where id = r.owner_id), 'A founder') into co;
  perform public.h_resend(jsonb_build_object('from', 'Hentity <hello@hentity.com>', 'to', jsonb_build_array(em), 'subject', code || ' is your code to open ' || co || '’s files',
    'html', public.h_email_layout('minimal', '', 'Your code: ' || code, 'Enter it on the page you opened to see ' || co || '’s files. It works for 15 minutes.',
      '<p style="margin:0 0 12px">' || public.h_esc(co) || ' shared files with you on Hentity' || case when l.label <> '' then ' (' || public.h_esc(l.label) || ')' else '' end || '.</p>'
      || '<p style="margin:0;font:600 28px/36px ''Geist Mono'',Menlo,monospace;letter-spacing:.2em;color:#0A0A0A">' || code || '</p>'
      || '<p style="margin:16px 0 0;color:#8A8A8A;font-size:13px">If you didn’t ask for this, you can ignore it.</p>',
      null, 'You’re getting this because someone asked for a code with this address on Hentity.', null)));
  return jsonb_build_object('sent', true);
end $$;

-- Open the link: checks the code (or nothing, for "anyone"), starts a session, grants the files for 30 minutes
create or replace function public.dr_start(tok text, em text default null, code text default null, dev text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare l dr_links; c dr_codes; s dr_sessions;
begin
  select * into l from dr_links where token = tok;
  if not public.dr_link_ok(l) then raise exception 'This link isn''t active any more' using errcode = 'P0001'; end if;
  em := lower(trim(coalesce(em, '')));
  if l.mode <> 'anyone' then
    select * into c from dr_codes where link_id = l.id and email = em;
    if c.link_id is null or c.expires_at < now() then raise exception 'That code has expired. Ask for a new one.' using errcode = 'P0001'; end if;
    if c.tries >= 5 then raise exception 'Too many tries. Ask for a new code.' using errcode = 'P0001'; end if;
    if c.code_hash <> encode(extensions.digest(coalesce(trim(code), '') || l.token, 'sha256'), 'hex') then
      update dr_codes set tries = tries + 1 where link_id = l.id and email = em;
      raise exception 'That code isn''t right' using errcode = 'P0001'; end if;
    delete from dr_codes where link_id = l.id and email = em;
  elsif em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then em := '';
  end if;
  insert into dr_sessions (link_id, email, verified, device) values (l.id, em, l.mode <> 'anyone', left(coalesce(dev, ''), 60)) returning * into s;
  return public.dr_files_for(s);
end $$;

create or replace function public.dr_files_for(s dr_sessions) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l dr_links; r dr_rooms;
begin
  select * into l from dr_links where id = s.link_id; select * into r from dr_rooms where id = l.room_id;
  insert into dr_grants (path, session_id, until)
  select f.path, s.id, now() + interval '30 minutes' from dr_files f where f.room_id = r.id and (l.file_ids is null or f.id = any(l.file_ids))
  on conflict (path, session_id) do update set until = excluded.until;
  delete from dr_grants where until < now() - interval '1 day';
  update dr_sessions set last_at = now() where id = s.id;
  return jsonb_build_object('session', s.secret, 'email', s.email, 'download', l.download, 'watermark', l.watermark, 'track', l.track,
    'files', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'item', f.item, 'folder', f.folder, 'name', f.name, 'path', f.path, 'size', f.size, 'mime', f.mime, 'pages', f.pages, 'updated_at', f.updated_at) order by f.folder, f.created_at), '[]')
              from dr_files f where f.room_id = r.id and (l.file_ids is null or f.id = any(l.file_ids))));
end $$;

-- Coming back within a day keeps the session (no new code)
create or replace function public.dr_resume(sec text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s dr_sessions; l dr_links;
begin
  select * into s from dr_sessions where secret = sec and last_at > now() - interval '1 day';
  if s.id is null then return null; end if;
  select * into l from dr_links where id = s.link_id;
  if not public.dr_link_ok(l) then return null; end if;
  return public.dr_files_for(s);
end $$;

-- Time on each page, sent every few seconds while a file is open
create or replace function public.dr_track(sec text, fid uuid, pg int, secs numeric, opened boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare s dr_sessions; l dr_links;
begin
  select * into s from dr_sessions where secret = sec; if s.id is null then return; end if;
  select * into l from dr_links where id = s.link_id; if not l.track or not public.dr_link_ok(l) then return; end if;
  if not exists (select 1 from dr_files f where f.id = fid and f.room_id = l.room_id and (l.file_ids is null or f.id = any(l.file_ids))) then return; end if;
  secs := greatest(0, least(coalesce(secs, 0), 120));
  insert into dr_views (session_id, file_id, page, seconds, opens) values (s.id, fid, greatest(1, coalesce(pg, 1)), secs, case when opened then 1 else 0 end)
  on conflict (session_id, file_id, page) do update set seconds = dr_views.seconds + excluded.seconds, opens = dr_views.opens + excluded.opens, last_at = now();
  update dr_sessions set last_at = now() where id = s.id;
end $$;

grant execute on function public.dr_open(text), public.dr_request_code(text, text), public.dr_start(text, text, text, text), public.dr_resume(text), public.dr_track(text, uuid, int, numeric, boolean) to anon, authenticated;
revoke execute on function public.dr_files_for(dr_sessions), public.dr_link_ok(dr_links) from public, anon, authenticated;
