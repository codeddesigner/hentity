-- Job posters choose what applicants send: CV, LinkedIn, both, or either one.
alter table public.find_roles add column if not exists apply_with text not null default 'either';
do $$ begin
  alter table public.find_roles add constraint find_roles_apply_with_check check (apply_with in ('cv','linkedin','both','either'));
exception when duplicate_object then null; end $$;

create or replace function public.find_express(rid uuid, intro text, answers jsonb default '[]'::jsonb, cv jsonb default null, linkedin text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r find_roles; me profiles; iid uuid; job boolean; li text; c jsonb; need text;
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
    need := coalesce(r.apply_with, 'either');
    if need in ('cv','both') and c is null then raise exception 'This role asks for your CV' using errcode = 'P0001'; end if;
    if need in ('linkedin','both') and li is null then raise exception 'This role asks for your LinkedIn profile' using errcode = 'P0001'; end if;
    if need = 'either' and c is null and li is null then raise exception 'Add your CV or LinkedIn profile' using errcode = 'P0001'; end if;
    -- Only send what the poster asked for
    if need = 'cv' then li := null; elsif need = 'linkedin' then c := null; end if;
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
  return out || jsonb_build_object('apply_with', coalesce(r.apply_with, 'either'), 'team', coalesce(team, '[]'::jsonb), 'intros_left', public.find_intros_left(),
    'me', (select public.find_person_json(f, r.owner_id) from find_profiles f where f.user_id = auth.uid()),
    'my_cv', (select f.cv from find_profiles f where f.user_id = auth.uid()),
    'my_linkedin', coalesce((select nullif(f.linkedin, '') from find_profiles f where f.user_id = auth.uid()), (select nullif(p.linkedin, '') from profiles p where p.id = auth.uid()), ''));
end $$;
