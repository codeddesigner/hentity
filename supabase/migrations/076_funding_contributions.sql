-- Funding contributions: members suggest a new grant or investor, or a fix to an existing listing.
-- Nothing goes live until an admin approves it. Approved new listings credit the person who shared them.

alter table public.funding_opps add column if not exists contributed_by uuid references public.profiles(id) on delete set null;

create table if not exists public.funding_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('new', 'fix')),
  opp_id uuid references public.funding_opps(id) on delete cascade,
  data jsonb not null default '{}',
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'duplicate')),
  admin_note text not null default '',
  result_opp uuid references public.funding_opps(id) on delete set null,
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.funding_submissions enable row level security;   -- through the functions below
create index if not exists funding_submissions_status on public.funding_submissions (status, created_at desc);

create or replace function public.fsub_submit(k text, oid uuid, d jsonb, nt text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; recent int; nm text; url text;
begin
  if auth.uid() is null then raise exception 'Sign in to suggest an opportunity' using errcode = 'P0001'; end if;
  if exists (select 1 from profiles where id = auth.uid() and coalesce(banned, false)) then raise exception 'You can’t suggest right now' using errcode = 'P0001'; end if;
  if k not in ('new', 'fix') then raise exception 'Unknown suggestion' using errcode = 'P0001'; end if;
  select count(*) into recent from funding_submissions where user_id = auth.uid() and created_at > now() - interval '1 day';
  if recent >= 15 then raise exception 'That’s a lot for one day. Try again tomorrow.' using errcode = 'P0001'; end if;
  d := coalesce(d, '{}');
  if k = 'new' then
    nm := trim(coalesce(d ->> 'name', '')); url := trim(coalesce(d ->> 'apply_url', ''));
    if char_length(nm) < 2 then raise exception 'Add the name of the grant or investor' using errcode = 'P0001'; end if;
    if url !~* '^https?://[^ ]+\.[^ ]+' then raise exception 'Add a link (starting with https://) where founders can apply or learn more' using errcode = 'P0001'; end if;
    if coalesce(d ->> 'mode', '') not in ('grant', 'equity') then raise exception 'Say whether it’s a grant or an investor' using errcode = 'P0001'; end if;
    if exists (select 1 from funding_opps where lower(name) = lower(nm) or (apply_url <> '' and lower(rtrim(apply_url, '/')) = lower(rtrim(url, '/')))) then
      raise exception 'We already list %. If something about it is wrong, open it and use “Suggest a fix”.', nm using errcode = 'P0001'; end if;
    if exists (select 1 from funding_submissions where status = 'pending' and kind = 'new' and lower(data ->> 'name') = lower(nm)) then
      raise exception 'Someone already suggested % and it’s waiting for review. Thanks!', nm using errcode = 'P0001'; end if;
    oid := null;
  else
    if oid is null or not exists (select 1 from funding_opps where id = oid and active) then raise exception 'That listing isn’t here any more' using errcode = 'P0001'; end if;
    if char_length(trim(coalesce(nt, ''))) < 5 and d = '{}'::jsonb then raise exception 'Tell us what’s wrong or what changed' using errcode = 'P0001'; end if;
  end if;
  -- keep only the fields a member can suggest, trimmed to sensible lengths
  d := (select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' then to_jsonb(left(trim(value #>> '{}'), 2000)) else value end), '{}')
        from jsonb_each(d) where key in ('name', 'org', 'mode', 'kind', 'apply_url', 'website', 'amount_text', 'deadline', 'round_note', 'countries', 'categories', 'stages', 'description', 'source_url', 'women_only')
          and value not in ('""'::jsonb, 'null'::jsonb, '[]'::jsonb));
  insert into funding_submissions (user_id, kind, opp_id, data, note) values (auth.uid(), k, oid, d, left(trim(coalesce(nt, '')), 2000)) returning id into sid;
  insert into notifications (user_id, type, grp, title, body, link, actor_id)
  select u.id, 'funding_sub', 'system',
    case when k = 'new' then 'New funding suggestion: ' || coalesce(d ->> 'name', '') else 'Fix suggested for ' || (select name from funding_opps where id = oid) end,
    'From @' || (select username from profiles where id = auth.uid()) || '. Review it in Admin → Funding.', '/admin#funding/suggestions', auth.uid()
  from profiles u where u.role in ('admin', 'moderator') and u.id <> auth.uid();
  return sid;
end $$;

create or replace function public.fsub_mine() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'status', s.status, 'name', coalesce(s.data ->> 'name', o.name), 'admin_note', s.admin_note,
    'result_opp', coalesce(s.result_opp, s.opp_id), 'created_at', s.created_at, 'decided_at', s.decided_at) order by s.created_at desc), '[]')
  from funding_submissions s left join funding_opps o on o.id = s.opp_id where s.user_id = auth.uid();
$$;

create or replace function public.fsub_list(st text default 'pending') returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
      'by', (select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'is_verified', u.is_verified,
        'approved', (select count(*) from funding_submissions x where x.user_id = u.id and x.status = 'approved')) from profiles u where u.id = s.user_id),
      'opp', (select to_jsonb(o) from funding_opps o where o.id = s.opp_id)) order by s.created_at desc), '[]')
    from funding_submissions s where st = 'all' or s.status = st);
end $$;

-- Approve (after the admin has created or updated the listing), reject, or mark as a duplicate; the member is told either way
create or replace function public.fsub_decide(sid uuid, st text, opp uuid default null, nt text default '') returns void
language plpgsql security definer set search_path = public as $$
declare s funding_submissions; nm text;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
  if st not in ('approved', 'rejected', 'duplicate') then raise exception 'Unknown decision' using errcode = 'P0001'; end if;
  update funding_submissions set status = st, result_opp = coalesce(opp, opp_id), admin_note = left(trim(coalesce(nt, '')), 500), decided_by = auth.uid(), decided_at = now()
  where id = sid and status = 'pending' returning * into s;
  if s.id is null then raise exception 'Already decided' using errcode = 'P0001'; end if;
  if st = 'approved' and s.kind = 'new' and opp is not null then
    update funding_opps set contributed_by = s.user_id where id = opp and contributed_by is null;
  end if;
  select name into nm from funding_opps where id = coalesce(opp, s.opp_id);
  nm := coalesce(nm, s.data ->> 'name', 'your suggestion');
  insert into notifications (user_id, type, grp, title, body, link, actor_id)
  values (s.user_id, 'funding_sub', 'system',
    case st when 'approved' then case when s.kind = 'new' then nm || ' is now on Hentity Funding' else 'Thanks: we updated ' || nm end
            when 'duplicate' then nm || ' is already on Hentity' else 'We didn’t add ' || nm end,
    case st when 'approved' then case when s.kind = 'new' then 'Thanks for sharing it. Founders can now find it, and it shows you shared it.' else 'Your fix is live. Thanks for keeping the listings right.' end
            else coalesce(nullif(s.admin_note, ''), case when st = 'duplicate' then 'Someone shared it first. Thanks all the same.' else 'It didn’t meet our listing rules this time. Thanks for sharing.' end) end,
    case when st = 'approved' or st = 'duplicate' then case when coalesce(opp, s.opp_id) is not null then '/funding/' || coalesce(opp, s.opp_id) else '/funding' end else '/funding' end, auth.uid());
  insert into audit_log (actor_id, action, target_type, target_id, meta) values (auth.uid(), 'funding_suggestion_' || st, 'funding_submission', sid::text, jsonb_build_object('opp', coalesce(opp, s.opp_id)));
end $$;

-- "Shared by" on a listing
create or replace function public.funding_credit(oid uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('username', u.username, 'name', u.name) from funding_opps o join profiles u on u.id = o.contributed_by where o.id = oid and o.active and not coalesce(u.banned, false);
$$;

grant execute on function public.fsub_submit(text, uuid, jsonb, text), public.fsub_mine(), public.fsub_list(text), public.fsub_decide(uuid, text, uuid, text) to authenticated;
revoke execute on function public.fsub_submit(text, uuid, jsonb, text), public.fsub_mine(), public.fsub_list(text), public.fsub_decide(uuid, text, uuid, text) from anon;
grant execute on function public.funding_credit(uuid) to anon, authenticated;
