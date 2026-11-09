-- Product teams: co-founders and teammates can ask to join a product someone else listed, and invited
-- makers can finally accept. Owners approve requests; invitees accept invites. Pending people get no rights.

alter table public.product_makers add column if not exists requested boolean not null default false;   -- true: they asked; false: the owner invited them
alter table public.product_makers add column if not exists created_at timestamptz not null default now();

-- Only accepted makers (and the owner) count as makers
create or replace function public.is_maker(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from products where id = p and owner_id = auth.uid())
      or exists (select 1 from product_makers where product_id = p and user_id = auth.uid() and accepted);
$$;

-- Nobody accepts themselves by editing the row: answers go through team_respond()
drop policy if exists "makers accept" on public.product_makers;
drop policy if exists "makers admin update" on public.product_makers;
create policy "makers admin update" on public.product_makers for update using (public.is_admin());

create or replace function public.team_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare p products; who profiles; own profiles;
begin
  select * into p from products where id = coalesce(new.product_id, old.product_id);
  if p.id is null then return null; end if;
  select * into own from profiles where id = p.owner_id;
  if tg_op = 'INSERT' and not new.accepted then
    select * into who from profiles where id = new.user_id;
    if new.requested then
      insert into notifications (user_id, type, grp, title, body, link, actor_id, product_id)
      values (p.owner_id, 'team', 'system', coalesce(who.name, who.username) || ' asked to join ' || p.name,
        'As ' || coalesce(nullif(new.role, ''), 'a maker') || '. Approve or decline in My products.', '/my-products?team=' || p.id, new.user_id, p.id);
    else
      insert into notifications (user_id, type, grp, title, body, link, actor_id, product_id)
      values (new.user_id, 'team', 'system', coalesce(own.name, own.username, 'The founder') || ' invited you to join ' || p.name,
        'Accept to show up as ' || coalesce(nullif(new.role, ''), 'a maker') || ' on ' || p.name || ' and help run its page.', '/products/' || p.slug || '?join=1', p.owner_id, p.id);
    end if;
  elsif tg_op = 'UPDATE' and new.accepted and not old.accepted then
    select * into who from profiles where id = new.user_id;
    if new.requested then
      insert into notifications (user_id, type, grp, title, body, link, actor_id, product_id)
      values (new.user_id, 'team', 'system', 'You’re on the ' || p.name || ' team', 'You now show up on its page and can help run it.', '/products/' || p.slug, p.owner_id, p.id);
    else
      insert into notifications (user_id, type, grp, title, body, link, actor_id, product_id)
      values (p.owner_id, 'team', 'system', coalesce(who.name, who.username) || ' joined ' || p.name, 'They now show up on its page as ' || coalesce(nullif(new.role, ''), 'a maker') || '.', '/products/' || p.slug, new.user_id, p.id);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists product_makers_notify on public.product_makers;
create trigger product_makers_notify after insert or update on public.product_makers for each row execute function public.team_notify();

-- Ask to join a product's team
create or replace function public.team_request(pid uuid, rl text default 'Co-founder') returns void
language plpgsql security definer set search_path = public as $$
declare p products; cur product_makers;
begin
  if auth.uid() is null then raise exception 'Sign in to ask to join' using errcode = 'P0001'; end if;
  select * into p from products where id = pid;
  if p.id is null or p.status in ('archived', 'rejected') then raise exception 'Product not found' using errcode = 'P0001'; end if;
  if p.owner_id is null then raise exception 'Nobody runs this page yet. Claim it instead.' using errcode = 'P0001'; end if;
  if p.owner_id = auth.uid() then raise exception 'You already own this product' using errcode = 'P0001'; end if;
  select * into cur from product_makers where product_id = pid and user_id = auth.uid();
  if cur.user_id is not null then
    if cur.accepted then raise exception 'You’re already on this team' using errcode = 'P0001'; end if;
    if not cur.requested then   -- they were invited already: asking counts as accepting
      update product_makers set accepted = true where product_id = pid and user_id = auth.uid(); return;
    end if;
    raise exception 'You already asked. The owner has been told.' using errcode = 'P0001';
  end if;
  if (select count(*) from product_makers where user_id = auth.uid() and requested and not accepted and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many requests today' using errcode = 'P0001'; end if;
  insert into product_makers (product_id, user_id, role, accepted, requested) values (pid, auth.uid(), left(coalesce(nullif(trim(rl), ''), 'Co-founder'), 40), false, true);
end $$;

-- Answer: the owner approves or declines a request; the invitee accepts or declines an invite
create or replace function public.team_respond(pid uuid, uid uuid, ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare p products; m product_makers;
begin
  select * into p from products where id = pid;
  select * into m from product_makers where product_id = pid and user_id = uid;
  if m.user_id is null then raise exception 'That request isn’t there any more' using errcode = 'P0001'; end if;
  if m.accepted then return; end if;
  if m.requested and not (p.owner_id = auth.uid() or public.is_admin()) then raise exception 'Only the owner can approve this' using errcode = 'P0001'; end if;
  if not m.requested and uid <> auth.uid() then raise exception 'Only the person invited can accept' using errcode = 'P0001'; end if;
  if ok then update product_makers set accepted = true where product_id = pid and user_id = uid;
  else delete from product_makers where product_id = pid and user_id = uid; end if;
end $$;

-- What's waiting for me: invites to me, and requests to join my products
create or replace function public.team_pending() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invites', (select coalesce(jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'logo_url', p.logo_url, 'color', p.color, 'tagline', p.tagline), 'role', m.role,
        'by', (select jsonb_build_object('name', u.name, 'username', u.username) from profiles u where u.id = p.owner_id), 'created_at', m.created_at) order by m.created_at desc), '[]')
      from product_makers m join products p on p.id = m.product_id where m.user_id = auth.uid() and not m.accepted and not m.requested),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'logo_url', p.logo_url, 'color', p.color), 'role', m.role,
        'user', jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'headline', u.headline, 'is_verified', u.is_verified), 'created_at', m.created_at) order by m.created_at desc), '[]')
      from product_makers m join products p on p.id = m.product_id join profiles u on u.id = m.user_id where p.owner_id = auth.uid() and not m.accepted and m.requested),
    'sent', (select coalesce(jsonb_agg(m.product_id), '[]') from product_makers m where m.user_id = auth.uid() and not m.accepted and m.requested));
$$;

grant execute on function public.team_request(uuid, text), public.team_respond(uuid, uuid, boolean), public.team_pending() to authenticated;
revoke execute on function public.team_request(uuid, text), public.team_respond(uuid, uuid, boolean), public.team_pending() from anon;
revoke execute on function public.team_notify() from public, anon, authenticated;

-- Invites sent before this fix never reached anyone: tell those people now
insert into notifications (user_id, type, grp, title, body, link, actor_id, product_id)
select m.user_id, 'team', 'system', coalesce(o.name, o.username, 'The founder') || ' invited you to join ' || p.name,
  'Accept to show up as ' || coalesce(nullif(m.role, ''), 'a maker') || ' on ' || p.name || ' and help run its page.', '/products/' || p.slug || '?join=1', p.owner_id, p.id
from product_makers m join products p on p.id = m.product_id left join profiles o on o.id = p.owner_id
where not m.accepted and not m.requested and p.status in ('live', 'scheduled', 'unclaimed', 'review', 'changes');
