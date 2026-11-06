-- Roles from startups without a verified product wait for an admin before they reach the board.
-- Verified products (that the poster owns or makes) go live straight away. Once approved, a role
-- can be edited, closed and reopened without going back to review.

alter table public.find_roles drop constraint if exists find_roles_status_check;
alter table public.find_roles add constraint find_roles_status_check check (status in ('draft','review','open','closed','rejected'));
alter table public.find_roles add column if not exists approved_at timestamptz;
alter table public.find_roles add column if not exists review_note text;
-- Roles already on the board count as approved
update public.find_roles set approved_at = coalesce(approved_at, created_at) where status in ('open','closed');

create or replace function public.find_role_verified(r public.find_roles) returns boolean
language sql stable security definer set search_path = public as $$
  select r.product_id is not null and exists (
    select 1 from products p where p.id = r.product_id and p.verified and p.status in ('live','scheduled')
      and (p.owner_id = r.owner_id or exists (select 1 from product_makers m where m.product_id = p.id and m.user_id = r.owner_id and m.accepted)));
$$;

create or replace function public.guard_find_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if current_setting('hentity.counter', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.interest_count := 0; new.approved_at := null; new.review_note := null;
  else
    new.owner_id := old.owner_id; new.interest_count := old.interest_count;
    new.approved_at := old.approved_at; new.review_note := old.review_note;
  end if;
  -- Members can't approve or reject their own role
  if new.status = 'rejected' and (tg_op = 'INSERT' or old.status <> 'rejected') then new.status := 'review'; end if;
  if new.status = 'open' and new.approved_at is null then
    if public.find_role_verified(new) then new.approved_at := now();
    else new.status := 'review'; end if;
  end if;
  return new;
end $$;

create or replace function public.find_review_role(rid uuid, ok boolean, why text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r find_roles;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from find_roles where id = rid;
  if r.id is null then raise exception 'Role not found' using errcode = 'P0001'; end if;
  perform set_config('hentity.counter', 'on', true);
  update find_roles set status = case when ok then 'open' else 'rejected' end, approved_at = case when ok then now() else null end,
    review_note = nullif(trim(coalesce(why, '')), ''), updated_at = now() where id = rid;
  perform set_config('hentity.counter', 'off', true);
  perform public.find_note(r.owner_id, case when ok then 'Your role is live: ' || r.title else 'Your role wasn’t approved: ' || r.title end,
    coalesce(nullif(trim(coalesce(why, '')), ''), case when ok then 'It’s on the Find board now.' else 'Edit it and post again.' end),
    case when ok then '/find/roles/' || r.id else '/find/post?edit=' || r.id end);
  perform public.audit(case when ok then 'find.role_approved' else 'find.role_rejected' end, 'find_role', r.id::text, jsonb_build_object('title', r.title, 'note', why));
end $$;

create or replace function public.admin_find_roles(st text default 'review') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return (select coalesce(jsonb_agg(x order by (x ->> 'updated_at')), '[]'::jsonb) from (
    select to_jsonb(r) || jsonb_build_object(
      'owner', (select jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'email', u.email, 'is_verified', u.is_verified, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color) from profiles u where u.id = r.owner_id),
      'product', (select jsonb_build_object('name', p.name, 'slug', p.slug, 'verified', p.verified, 'status', p.status, 'logo_url', p.logo_url, 'color', p.color) from products p where p.id = r.product_id)) x
    from find_roles r where (st = 'all' and r.status <> 'draft') or r.status = st order by r.updated_at limit 200) s);
end $$;

grant execute on function public.find_review_role(uuid, boolean, text), public.admin_find_roles(text) to authenticated;
revoke execute on function public.find_review_role(uuid, boolean, text), public.admin_find_roles(text) from anon;
revoke execute on function public.find_role_verified(public.find_roles) from public, anon, authenticated;

-- Tell admins when a role needs a look
create or replace function public.find_role_review_alert() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if new.status = 'review' and (tg_op = 'INSERT' or old.status <> 'review') then
    for a in select id from profiles where role = 'admin' loop
      insert into notifications (user_id, type, grp, title, body, link, action_label)
      values (a.id, 'find', 'system', 'Role to review: ' || new.title, coalesce(nullif(new.startup_name, ''), 'Startup without a verified product'), '/admin#findroles', 'Review');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists find_roles_review_alert on public.find_roles;
create trigger find_roles_review_alert after insert or update of status on public.find_roles for each row execute function public.find_role_review_alert();

-- Admin nav badge
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles where not is_seed),
    'users_week', (select count(*) from profiles where created_at > now() - interval '7 days' and not is_seed),
    'products', (select count(*) from products),
    'live', (select count(*) from product_feed where effective_status = 'live'),
    'review', (select count(*) from products where status = 'review'),
    'edits', (select count(*) from product_edits where status = 'pending'),
    'findroles', (select count(*) from find_roles where status = 'review'),
    'scheduled', (select count(*) from product_feed where effective_status = 'scheduled'),
    'upvotes_week', (select count(*) from upvotes where created_at > now() - interval '7 days'),
    'comments_week', (select count(*) from comments where created_at > now() - interval '7 days'),
    'messages_week', (select count(*) from messages where created_at > now() - interval '7 days'),
    'reports_open', (select count(*) from reports where status = 'open'),
    'subscribers', (select count(*) from newsletter),
    'suggestions', (select count(*) from story_suggestions where status = 'new'),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]') from (
        select date_trunc('day', created_at)::date d, count(*) n from profiles where created_at > now() - interval '14 days' and not is_seed group by 1) s),
    'votes_by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]') from (
        select date_trunc('day', created_at)::date d, count(*) n from upvotes where created_at > now() - interval '14 days' group by 1) s)
  );
end $$;
