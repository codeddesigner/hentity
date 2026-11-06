-- Find: applying to jobs with a CV and LinkedIn (Figma 26.15 / 26.16).
-- CVs live in a private bucket. Public roles: the poster can open the CV as soon as it arrives.
-- Stealth and invite-only roles: the CV and LinkedIn wait until both sides say yes.

alter table public.find_profiles add column if not exists cv jsonb;          -- {path, name, size}
alter table public.find_profiles add column if not exists linkedin text not null default '';
alter table public.find_interests add column if not exists cv jsonb;
alter table public.find_interests add column if not exists linkedin text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('find-cv', 'find-cv', false, 5242880, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Can the current user open this CV?
create or replace function public.find_cv_readable(obj text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(obj, '/', 1) = auth.uid()::text or exists (
    select 1 from find_interests i join find_roles r on r.id = i.role_id
    where i.cv ->> 'path' = obj and i.to_user = auth.uid() and i.status <> 'withdrawn'
      and (r.visibility = 'public' or exists (select 1 from find_matches m where m.interest_id = i.id and m.revealed_at is not null)));
$$;

drop policy if exists "find cv upload own" on storage.objects;
create policy "find cv upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'find-cv' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "find cv read" on storage.objects;
create policy "find cv read" on storage.objects for select to authenticated
  using (bucket_id = 'find-cv' and public.find_cv_readable(name));
drop policy if exists "find cv delete own" on storage.objects;
create policy "find cv delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'find-cv' and (storage.foldername(name))[1] = auth.uid()::text);

drop function if exists public.find_express(uuid, text, jsonb);
create or replace function public.find_express(rid uuid, intro text, answers jsonb default '[]'::jsonb, cv jsonb default null, linkedin text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r find_roles; me profiles; iid uuid; job boolean; li text; c jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  if not public.feature_on('find') and not public.is_admin() then raise exception 'Find is turned off right now' using errcode = 'P0001'; end if;
  select * into r from find_roles where id = rid and status = 'open';
  if r.id is null or public.find_blocked(r.hide_from, auth.uid()) then raise exception 'This role isn''t open' using errcode = 'P0001'; end if;
  if r.owner_id = auth.uid() then raise exception 'This is your role' using errcode = 'P0001'; end if;
  select * into me from profiles where id = auth.uid();
  if r.verified_only and not me.is_verified then raise exception 'This role only takes replies from verified members' using errcode = 'P0001'; end if;
  job := r.kind <> 'cofounder';
  li := nullif(trim(coalesce(linkedin, '')), '');
  if li is not null and li !~* '^(https?://)?([a-z]{2,3}\.)?linkedin\.com/(in|pub)/[^ ]{2,}' then raise exception 'Use a LinkedIn profile link, like linkedin.com/in/your-name' using errcode = 'P0001'; end if;
  c := case when cv is not null and cv ? 'path' and split_part(cv ->> 'path', '/', 1) = auth.uid()::text then jsonb_build_object('path', cv ->> 'path', 'name', left(coalesce(cv ->> 'name', 'CV'), 120), 'size', (cv ->> 'size')::int) end;
  if job then
    if c is null and li is null then raise exception 'Add your CV or LinkedIn profile' using errcode = 'P0001'; end if;
  elsif char_length(trim(coalesce(intro, ''))) < 20 then raise exception 'Write a short intro (a sentence or two)' using errcode = 'P0001'; end if;
  if exists (select 1 from find_interests where role_id = rid and from_user = auth.uid() and status <> 'withdrawn') then raise exception 'You''ve already applied' using errcode = 'P0001'; end if;
  if public.find_intros_left() <= 0 then raise exception 'You''ve used your 5 intros this week. More open up in a few days.' using errcode = 'P0001'; end if;
  delete from find_interests where role_id = rid and from_user = auth.uid() and status = 'withdrawn';
  insert into find_interests (kind, role_id, from_user, to_user, intro, answers, cv, linkedin)
  values ('interest', rid, auth.uid(), r.owner_id, left(trim(coalesce(intro, '')), 800), coalesce(answers, '[]'::jsonb), c, coalesce(li, '')) returning id into iid;
  perform set_config('hentity.counter', 'on', true);
  update find_roles set interest_count = interest_count + 1 where id = rid;
  perform set_config('hentity.counter', 'off', true);
  perform public.find_note(r.owner_id, case when job then 'New application for ' else 'Someone is interested in ' end || r.title,
    left(coalesce(nullif(trim(coalesce(intro, '')), ''), case when c is not null then 'CV attached' else 'LinkedIn attached' end), 140), '/find/matches');
  return jsonb_build_object('id', iid, 'intros_left', public.find_intros_left());
end $$;
grant execute on function public.find_express(uuid, text, jsonb, jsonb, text) to authenticated;

-- Withdrawing frees the slot so you can apply again later with a different CV
create or replace function public.find_withdraw(iid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i find_interests;
begin
  select * into i from find_interests where id = iid and from_user = auth.uid() and status = 'pending';
  if i.id is null then return; end if;
  update find_interests set status = 'withdrawn', decided_at = now() where id = iid;
  perform set_config('hentity.counter', 'on', true);
  update find_roles set interest_count = greatest(0, interest_count - 1) where id = i.role_id;
  perform set_config('hentity.counter', 'off', true);
end $$;

-- Inbox: incoming applications carry the CV and LinkedIn when the role is public
create or replace function public.find_inbox() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'at') desc), '[]'::jsonb) from (
    select jsonb_build_object('type', 'match', 'id', m.id, 'at', m.last_at, 'revealed', m.revealed_at is not null, 'nda_required', m.nda_required,
      'me_signed', case when auth.uid() = m.poster then m.poster_signed_at else m.candidate_signed_at end is not null,
      'title', r.title, 'kind', r.kind, 'startup', (public.find_role_json(r, auth.uid()) -> 'startup' ->> 'name'),
      'other', case when m.revealed_at is not null then (select jsonb_build_object('name', u.name, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color) from profiles u where u.id = case when auth.uid() = m.poster then m.candidate else m.poster end) else null end,
      'last', (select body from find_messages fm where fm.match_id = m.id order by created_at desc limit 1)) x
    from find_matches m left join find_roles r on r.id = m.role_id where auth.uid() in (m.poster, m.candidate)
    union all
    select jsonb_build_object('type', 'interest', 'id', i.id, 'at', i.created_at, 'kind', i.kind, 'role_kind', r.kind, 'incoming', i.to_user = auth.uid(), 'status', i.status,
      'title', r.title, 'role_id', r.id, 'startup', (public.find_role_json(r, auth.uid()) -> 'startup' ->> 'name'), 'intro', i.intro, 'answers', i.answers,
      'questions', r.questions,
      'cv', case when i.from_user = auth.uid() or r.visibility = 'public' then i.cv end,
      'linkedin', case when i.from_user = auth.uid() or r.visibility = 'public' then nullif(i.linkedin, '') end,
      'cv_hidden', i.to_user = auth.uid() and r.visibility <> 'public' and (i.cv is not null or i.linkedin <> ''),
      'person', case when i.to_user = auth.uid() then (select public.find_person_json(f, auth.uid()) from find_profiles f where f.user_id = i.from_user) end)
    from find_interests i join find_roles r on r.id = i.role_id
    where auth.uid() in (i.from_user, i.to_user) and i.status in ('pending', 'declined') and not exists (select 1 from find_matches m where m.interest_id = i.id)
  ) s(x);
$$;

-- Match: the poster sees the application's CV and LinkedIn once revealed (or straight away for public roles)
create or replace function public.find_match(mid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m find_matches; r find_roles; other uuid; side text; fo find_profiles; i find_interests; u profiles; rev boolean; show_app boolean;
begin
  select * into m from find_matches where id = mid;
  if m.id is null or auth.uid() not in (m.poster, m.candidate) then return null; end if;
  select * into r from find_roles where id = m.role_id;
  select * into i from find_interests where id = m.interest_id;
  side := case when auth.uid() = m.poster then 'poster' else 'candidate' end;
  other := case when side = 'poster' then m.candidate else m.poster end;
  rev := m.revealed_at is not null;
  show_app := i.from_user = auth.uid() or rev or r.visibility = 'public';
  select * into u from profiles where id = other;
  select * into fo from find_profiles where user_id = other;
  return jsonb_build_object('id', m.id, 'side', side, 'revealed', rev, 'nda_required', m.nda_required,
    'me_signed', case when side = 'poster' then m.poster_signed_at else m.candidate_signed_at end,
    'they_signed', case when side = 'poster' then m.candidate_signed_at else m.poster_signed_at end,
    'revealed_at', m.revealed_at, 'created_at', m.created_at, 'trial', m.trial,
    'role', case when r.id is null then null else public.find_role_json(r, auth.uid()) end,
    'intro', i.intro, 'answers', i.answers, 'intro_from_me', i.from_user = auth.uid(),
    'cv', case when show_app then i.cv end, 'linkedin', case when show_app then nullif(i.linkedin, '') end,
    'other', case when rev then jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'headline', u.headline,
        'linkedin', u.linkedin, 'website', u.website, 'what', fo.what, 'experience', fo.experience, 'employer', fo.employer, 'city', coalesce(nullif(fo.city, ''), u.city))
      else case when side = 'poster' and fo.user_id is not null then public.find_person_json(fo, auth.uid())
        else jsonb_build_object('name', case when side = 'poster' then 'Candidate' else (public.find_role_json(r, auth.uid()) -> 'poster' ->> 'name') end, 'stealth', true) end end,
    'fit_mine', coalesce(m.fit -> side, '{}'::jsonb),
    'fit_theirs', case when rev then (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(coalesce(m.fit -> (case when side = 'poster' then 'candidate' else 'poster' end), '{}'::jsonb)) t(k, v) where coalesce(m.fit -> side, '{}'::jsonb) ? k) else '{}'::jsonb end,
    'fit_theirs_count', (select count(*) from jsonb_object_keys(coalesce(m.fit -> (case when side = 'poster' then 'candidate' else 'poster' end), '{}'::jsonb))));
end $$;

-- Role detail also tells the page whether the applicant's CV will travel now or after a match
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
    'me', (select public.find_person_json(f, r.owner_id) from find_profiles f where f.user_id = auth.uid()),
    'my_cv', (select f.cv from find_profiles f where f.user_id = auth.uid()),
    'my_linkedin', coalesce((select nullif(f.linkedin, '') from find_profiles f where f.user_id = auth.uid()), (select nullif(p.linkedin, '') from profiles p where p.id = auth.uid()), ''));
end $$;
