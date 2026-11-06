-- Live and scheduled products can't be edited directly. Their makers send a change request
-- (logo, name, tagline, website, CAC/RC number, media, ...) and an admin approves it field by field.

create table if not exists public.product_edits (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  changes jsonb not null,          -- only the fields that differ: {field: new value}
  before jsonb not null,           -- the same fields as they were when sent
  note text not null default '' check (char_length(note) <= 600),
  status text not null default 'pending' check (status in ('pending','approved','partial','rejected','withdrawn')),
  admin_note text,
  applied text[] not null default '{}',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id)
);
create unique index if not exists product_edits_one_pending on public.product_edits (product_id) where status = 'pending';
create index if not exists product_edits_status_idx on public.product_edits (status, created_at);

alter table public.product_edits enable row level security;
drop function if exists public.product_edit_decide(uuid, boolean, text[], text, boolean);
drop function if exists public.product_edit_request(uuid, jsonb, text);
drop policy if exists "edits makers read" on public.product_edits;
create policy "edits makers read" on public.product_edits for select using (public.is_admin() or public.is_maker(product_id));
grant select on public.product_edits to authenticated;

-- Fields a maker may ask to change, and their current values
create or replace function public.product_edit_fields(p public.products) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.name, 'tagline', p.tagline, 'description', coalesce(p.description, ''), 'website', coalesce(p.website, ''),
    'logo_url', p.logo_url, 'color', coalesce(p.color, '#000000'), 'media', p.media, 'video_url', coalesce(p.video_url, ''),
    'categories', to_jsonb(p.categories), 'country', coalesce(p.country, ''), 'city', coalesce(p.city, ''),
    'pay_methods', to_jsonb(p.pay_methods), 'stage', coalesce(p.stage, ''), 'platforms', coalesce(p.platforms, ''),
    'languages', coalesce(p.languages, ''), 'currencies', coalesce(p.currencies, ''),
    'registration', coalesce(p.verify ->> 'company', (select c.registration from companies c where c.id = p.company_id), ''),
    'founder_link', coalesce(p.verify ->> 'founder', ''));
$$;

create or replace function public.product_edit_request(pid uuid, changes jsonb, msg text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare p products; cur jsonb; diff jsonb := '{}'::jsonb; k text; v jsonb; eid uuid; allowed text[];
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  select * into p from products where id = pid;
  if p.id is null or not (p.owner_id = auth.uid() or public.is_maker(pid)) then raise exception 'Only this product’s makers can request changes' using errcode = 'P0001'; end if;
  if p.status not in ('live','scheduled') then raise exception 'Edit this product directly. Change requests are for live and scheduled products.' using errcode = 'P0001'; end if;
  cur := public.product_edit_fields(p);
  allowed := array(select jsonb_object_keys(cur));
  for k, v in select * from jsonb_each(coalesce(changes, '{}'::jsonb)) loop
    if not k = any(allowed) then continue; end if;
    if jsonb_typeof(v) = 'string' then v := to_jsonb(trim(v #>> '{}')); end if;
    if v is distinct from cur -> k and not (v = '""'::jsonb and (cur -> k) = 'null'::jsonb) then diff := diff || jsonb_build_object(k, v); end if;
  end loop;
  if diff = '{}'::jsonb then raise exception 'Nothing has changed yet' using errcode = 'P0001'; end if;
  if diff ? 'name' and char_length(diff ->> 'name') not between 1 and 80 then raise exception 'Name must be 1 to 80 characters' using errcode = 'P0001'; end if;
  if diff ? 'tagline' and char_length(diff ->> 'tagline') not between 1 and 140 then raise exception 'Tagline must be 1 to 140 characters' using errcode = 'P0001'; end if;
  if diff ? 'website' and (diff ->> 'website') !~* '^https?://[^ /]+\.[^ ]+' then raise exception 'Use a full website link, like https://yourproduct.com' using errcode = 'P0001'; end if;
  if diff ? 'categories' and (jsonb_typeof(diff -> 'categories') <> 'array' or jsonb_array_length(diff -> 'categories') not between 1 and 3) then raise exception 'Pick 1 to 3 categories' using errcode = 'P0001'; end if;
  if diff ? 'media' and (jsonb_typeof(diff -> 'media') <> 'array' or jsonb_array_length(diff -> 'media') > 5) then raise exception 'Up to 5 images' using errcode = 'P0001'; end if;
  if diff ? 'pay_methods' and jsonb_typeof(diff -> 'pay_methods') <> 'array' then raise exception 'Pick how people pay' using errcode = 'P0001'; end if;
  if diff ? 'description' and char_length(diff ->> 'description') > 4000 then raise exception 'Description is too long' using errcode = 'P0001'; end if;
  -- A new request replaces one that's still waiting
  update product_edits set status = 'withdrawn', decided_at = now() where product_id = pid and status = 'pending';
  insert into product_edits (product_id, user_id, changes, before, note)
  values (pid, auth.uid(), diff, (select coalesce(jsonb_object_agg(x, cur -> x), '{}'::jsonb) from jsonb_object_keys(diff) x), left(trim(coalesce(msg, '')), 600))
  returning id into eid;
  perform public.audit('product.edit_requested', 'product', pid::text, jsonb_build_object('name', p.name, 'fields', (select jsonb_agg(x) from jsonb_object_keys(diff) x)));
  return jsonb_build_object('id', eid, 'fields', (select jsonb_agg(x) from jsonb_object_keys(diff) x));
end $$;

create or replace function public.product_edit_withdraw(eid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update product_edits e set status = 'withdrawn', decided_at = now()
  where e.id = eid and e.status = 'pending' and (e.user_id = auth.uid() or exists (select 1 from products p where p.id = e.product_id and p.owner_id = auth.uid()));
end $$;

-- Admin decision. fields = which of the requested fields to apply (null = all of them when ok).
create or replace function public.product_edit_decide(eid uuid, ok boolean, fields text[] default null, why text default null, keep_verified boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e product_edits; p products; take text[]; c jsonb; k text; st text; who uuid;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into e from product_edits where id = eid for update;
  if e.id is null or e.status <> 'pending' then raise exception 'This request was already handled' using errcode = 'P0001'; end if;
  select * into p from products where id = e.product_id;
  take := case when ok then array(select x from jsonb_object_keys(e.changes) x where fields is null or x = any(fields)) else '{}'::text[] end;
  if ok and cardinality(take) = 0 then raise exception 'Pick at least one change to approve, or reject the request' using errcode = 'P0001'; end if;
  c := e.changes;
  foreach k in array take loop
    case k
      when 'name' then update products set name = c ->> k where id = p.id;
      when 'tagline' then update products set tagline = c ->> k where id = p.id;
      when 'description' then update products set description = c ->> k where id = p.id;
      when 'website' then update products set website = c ->> k where id = p.id;
      when 'logo_url' then update products set logo_url = nullif(c ->> k, '') where id = p.id;
      when 'color' then update products set color = c ->> k where id = p.id;
      when 'media' then update products set media = c -> k where id = p.id;
      when 'video_url' then update products set video_url = nullif(c ->> k, '') where id = p.id;
      when 'categories' then update products set categories = array(select jsonb_array_elements_text(c -> k)) where id = p.id;
      when 'country' then update products set country = c ->> k, countries = array[c ->> k] where id = p.id;
      when 'city' then update products set city = c ->> k where id = p.id;
      when 'pay_methods' then update products set pay_methods = array(select jsonb_array_elements_text(c -> k)) where id = p.id;
      when 'stage' then update products set stage = c ->> k where id = p.id;
      when 'platforms' then update products set platforms = c ->> k where id = p.id;
      when 'languages' then update products set languages = c ->> k where id = p.id;
      when 'currencies' then update products set currencies = c ->> k where id = p.id;
      when 'registration' then
        update products set verify = case when coalesce(c ->> k, '') = '' then verify - 'company' else verify || jsonb_build_object('company', c ->> k) end,
          verified = case when keep_verified and coalesce(c ->> k, '') <> '' then verified else false end where id = p.id;
        if p.company_id is not null then update companies set registration = nullif(c ->> k, '') where id = p.company_id; end if;
      when 'founder_link' then
        update products set verify = case when coalesce(c ->> k, '') = '' then verify - 'founder' else verify || jsonb_build_object('founder', c ->> k) end where id = p.id;
      else null;
    end case;
  end loop;
  st := case when not ok then 'rejected' when cardinality(take) < (select count(*) from jsonb_object_keys(e.changes)) then 'partial' else 'approved' end;
  update product_edits set status = st, applied = take, admin_note = nullif(trim(coalesce(why, '')), ''), decided_at = now(), decided_by = auth.uid() where id = eid;
  who := coalesce(e.user_id, p.owner_id);
  perform public.notify(who, 'product', 'system',
    case st when 'approved' then 'Your changes to ' || p.name || ' are live' when 'partial' then 'Some of your changes to ' || p.name || ' are live' else 'Your changes to ' || p.name || ' weren’t approved' end,
    coalesce(nullif(trim(coalesce(why, '')), ''), case when st = 'rejected' then 'Open the request to see what to change.' else 'Thanks for keeping your page up to date.' end),
    '/products/' || p.slug || '/edit', 'View', auth.uid(), p.id);
  perform public.audit('product.edit_' || st, 'product', p.id::text, jsonb_build_object('name', p.name, 'applied', take, 'note', why));
  return jsonb_build_object('status', st, 'applied', take);
end $$;

-- What the edit page needs in one call
create or replace function public.product_edit_state(pslug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p products;
begin
  select * into p from products where slug = pslug;
  if p.id is null or not (p.owner_id = auth.uid() or public.is_maker(p.id) or public.is_admin()) then return null; end if;
  return jsonb_build_object('id', p.id, 'slug', p.slug, 'status', p.status, 'verified', p.verified, 'claimed_at', p.claimed_at, 'week_id', p.week_id, 'launch_date', p.launch_date,
    'current', public.product_edit_fields(p),
    'pending', (select to_jsonb(e) from product_edits e where e.product_id = p.id and e.status = 'pending' limit 1),
    'history', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc), '[]'::jsonb) from (select * from product_edits e where e.product_id = p.id and e.status <> 'pending' order by created_at desc limit 10) e));
end $$;

create or replace function public.admin_product_edits(st text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return (select coalesce(jsonb_agg(x order by (x ->> 'created_at')), '[]'::jsonb) from (
    select to_jsonb(e) || jsonb_build_object(
      'product', jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'tagline', p.tagline, 'logo_url', p.logo_url, 'color', p.color, 'status', p.status, 'verified', p.verified),
      'user', (select jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'email', u.email, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color) from profiles u where u.id = e.user_id)) x
    from product_edits e join products p on p.id = e.product_id
    where (st = 'all' or e.status = st) order by e.created_at limit 200) s);
end $$;

grant execute on function public.product_edit_request(uuid, jsonb, text), public.product_edit_withdraw(uuid), public.product_edit_state(text),
  public.product_edit_decide(uuid, boolean, text[], text, boolean), public.admin_product_edits(text) to authenticated;
revoke execute on function public.product_edit_fields(public.products) from public, anon, authenticated;

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

revoke execute on function public.product_edit_request(uuid, jsonb, text), public.product_edit_withdraw(uuid), public.product_edit_state(text),
  public.product_edit_decide(uuid, boolean, text[], text, boolean), public.admin_product_edits(text) from anon;
