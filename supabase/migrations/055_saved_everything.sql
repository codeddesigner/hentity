-- Saved (Figma 223:231): one private list for products, stories, funding, Find roles and people, and beta tests.

-- Bookmarks can now point at beta calls and Find roles too
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.bookmarks'::regclass and contype = 'c' loop
    execute format('alter table public.bookmarks drop constraint %I', c);
  end loop;
end $$;
alter table public.bookmarks add constraint bookmarks_target_type_check check (target_type in ('product','article','beta','role'));

-- People on Find are only ever known to a viewer by a per-viewer key, so saving a person goes through these functions
-- and the saver never sees the person's account id.
create table if not exists public.saved_people (
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  person uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, person));
alter table public.saved_people enable row level security;
revoke all on public.saved_people from anon, authenticated;

create or replace function public.find_save_person(person_key text, on_ boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select f.user_id into pid from find_profiles f where md5(f.user_id::text || auth.uid()::text) = person_key and f.user_id <> auth.uid();
  if pid is null then raise exception 'That profile isn’t available'; end if;
  if on_ then insert into saved_people (user_id, person) values (auth.uid(), pid) on conflict do nothing;
  else delete from saved_people where user_id = auth.uid() and person = pid; end if;
  return on_;
end $$;

create or replace function public.my_saved_people_keys() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(md5(person::text || auth.uid()::text)), '{}') from saved_people where user_id = auth.uid();
$$;

-- Everything saved that lives outside plain bookmarks rows: roles, people, betas (saved or joined), funding (saved or applied)
create or replace function public.my_saved() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return '{}'::jsonb; end if;
  return jsonb_build_object(
    'roles', (select coalesce(jsonb_agg(public.find_role_json(r, me) || jsonb_build_object('saved_at', b.created_at) order by b.created_at desc), '[]'::jsonb)
      from bookmarks b join find_roles r on r.id = b.target_id
      where b.user_id = me and b.target_type = 'role' and not public.find_blocked(r.hide_from, me)
        and (r.visibility <> 'invite' or r.owner_id = me or exists (select 1 from find_interests i where i.role_id = r.id and me in (i.from_user, i.to_user)))),
    'people', (select coalesce(jsonb_agg(public.find_person_json(f, me) || jsonb_build_object('saved_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
      from saved_people s join find_profiles f on f.user_id = s.person join profiles u on u.id = f.user_id
      where s.user_id = me and f.mode <> 'paused' and not u.banned and not public.find_blocked(f.hide_from, me)
        and not exists (select 1 from blocks k where (k.user_id = f.user_id and k.blocked_id = me) or (k.user_id = me and k.blocked_id = f.user_id))),
    'betas', (select coalesce(jsonb_agg(x.j order by x.at desc), '[]'::jsonb) from (
      select greatest(bm.created_at, a.created_at) as at, jsonb_build_object(
        'id', bt.id, 'slug', bt.slug, 'title', bt.title, 'status', bt.status, 'spots', bt.spots, 'accepted_count', bt.accepted_count, 'applied_count', bt.applied_count,
        'closes_at', bt.closes_at, 'test_start', bt.test_start, 'test_end', bt.test_end, 'steps', coalesce(cardinality(bt.steps), 0),
        'product', jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'tagline', p.tagline, 'logo_url', p.logo_url, 'color', p.color, 'verified', p.verified),
        'saved', bm.user_id is not null, 'saved_at', coalesce(bm.created_at, a.created_at),
        'app', case when a.id is null then null else jsonb_build_object('status', a.status, 'created_at', a.created_at, 'tasks_done', to_jsonb(a.tasks_done),
          'position', case when a.status = 'waitlist' then (select count(*) + 1 from beta_applications w where w.beta_id = bt.id and w.status = 'waitlist' and w.created_at < a.created_at) end) end) as j
      from betas bt join products p on p.id = bt.product_id
      left join bookmarks bm on bm.user_id = me and bm.target_type = 'beta' and bm.target_id = bt.id
      left join beta_applications a on a.beta_id = bt.id and a.user_id = me and a.status not in ('left', 'declined')
      where (bm.user_id is not null or a.id is not null) and bt.status <> 'draft') x),
    'funding', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'mode', o.mode, 'kind', o.kind, 'org', o.org, 'color', o.color, 'logo_url', o.logo_url,
        'amount_text', o.amount_text, 'deadline', o.deadline, 'deadline_note', o.deadline_note, 'decision_by', o.decision_by, 'round_note', o.round_note,
        'apply_url', o.apply_url, 'website', o.website, 'active', o.active,
        'status', t.status, 'remind', t.remind, 'applied_at', t.applied_at, 'saved_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
      from funding_track t join funding_opps o on o.id = t.opp_id where t.user_id = me));
end $$;

grant execute on function public.find_save_person(text, boolean), public.my_saved_people_keys(), public.my_saved() to authenticated;
