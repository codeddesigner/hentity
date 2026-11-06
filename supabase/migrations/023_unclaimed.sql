-- Unclaimed profiles (Figma: Claims). Hentity creates a starter page from public business sources; the team
-- claims it (work email, DNS TXT record or company documents), reviews every imported fact, and publishes.
-- Unclaimed pages can be followed and "asked to join"; upvotes, comments, reviews and launches open after claiming.

-- 1. Status + stored facts ------------------------------------------------------------------------------------
alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check (status in ('draft','review','changes','scheduled','live','archived','rejected','unclaimed'));
-- claim = { facts: [{key,label,value,source,url,date,hidden,edited}], news: [{title,source,url,date}],
--           spotted_at, checked_at, contact_email, sources }
alter table public.products add column if not exists claim jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists claimed_at timestamptz;

create or replace view public.product_feed as
 SELECT p.id, p.slug, p.name, p.tagline, p.description, p.website, p.color, p.logo_url, p.media, p.video_url, p.categories,
    p.country, p.city, p.countries, p.pay_methods, p.currencies, p.languages, p.platforms, p.stage, p.company_id, p.owner_id,
    p.status, p.week_id, p.intro, p.support_pledge, p.featured, p.promoted, p.verified, p.verify, p.review_note, p.review_items,
    p.submitted_at, p.reviewed_at, p.reviewed_by, p.upvote_count, p.comment_count, p.follower_count, p.click_count, p.view_count,
    p.created_at, p.updated_at,
    CASE WHEN p.status = 'scheduled' AND COALESCE(launch_at(p.launch_date), w.starts_at) <= now() THEN 'live'::text ELSE p.status END AS effective_status,
    w.starts_at AS week_starts_at, w.ends_at AS week_ends_at, p.launch_date,
    (EXISTS (SELECT 1 FROM betas b WHERE b.product_id = p.id AND b.status = 'open' AND b.closes_at > now() AND b.accepted_count < b.spots
       AND COALESCE((b.settings ->> 'show_on_product')::boolean, true))) AS testers_wanted,
    -- public view of the imported facts: hidden ones never leave the database
    CASE WHEN p.claim = '{}'::jsonb THEN '{}'::jsonb ELSE
      p.claim - 'contact_email' || jsonb_build_object('facts', COALESCE((SELECT jsonb_agg(f) FROM jsonb_array_elements(p.claim->'facts') f WHERE NOT COALESCE((f->>'hidden')::boolean, false)), '[]'::jsonb)) END AS claim,
    p.claimed_at
   FROM products p LEFT JOIN weeks w ON w.id = p.week_id;

drop policy if exists "products public" on public.products;
create policy "products public" on public.products for select
  using (status in ('scheduled','live','unclaimed') or (claimed_at is not null and status in ('review','changes'))
         or owner_id = auth.uid() or public.is_maker(id) or public.is_admin());

-- No comments on a page nobody from the team can answer yet
create or replace function public.guard_unclaimed_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null and exists (select 1 from products where id = new.product_id and status = 'unclaimed') then
    raise exception 'Comments open once the team claims this page' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists guard_unclaimed_comment on public.comments;
create trigger guard_unclaimed_comment before insert on public.comments for each row execute function public.guard_unclaimed_comment();

-- Claimed listings go 'unclaimed' -> 'live' without a launch: don't send the "you're live on the board" note
create or replace function public.on_product_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare range text;
begin
  if new.status is distinct from old.status and old.status <> 'unclaimed' then
    select to_char(starts_at at time zone 'Africa/Lagos','DD Mon') into range from weeks where id = new.week_id;
    if new.status = 'scheduled' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> was approved and booked for the week of '||coalesce(range,'your chosen week')||'.', 'Review', '/scheduled?p='||new.slug, 'View schedule', null, new.id);
    elsif new.status = 'changes' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> needs changes: '||coalesce(new.review_note,'see the moderator note'), 'Review', '/changes-requested?p='||new.slug, 'Edit submission', null, new.id);
    elsif new.status = 'rejected' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> wasn''t approved: '||coalesce(new.review_note,''), 'Review', '/my-products', null, null, new.id);
    elsif new.status = 'live' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> is live on the board.', 'Launch', '/launch-week?p='||new.slug, 'View launch', null, new.id);
    end if;
    if public.is_admin() then
      perform audit('product.status', 'product', new.id::text, jsonb_build_object('from',old.status,'to',new.status,'note',new.review_note));
    end if;
  end if;
  return new;
end $$;

-- A claimed page that has never launched works like a draft: the team can edit it and send it for a launch day
create or replace function public.guard_product() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken int; listing boolean;
begin
  new.updated_at := now();
  if public.is_admin() or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.status := 'draft';
    new.featured := false; new.promoted := false; new.verified := false;
    new.upvote_count := 0; new.comment_count := 0; new.follower_count := 0; new.click_count := 0; new.view_count := 0;
    new.claim := '{}'::jsonb; new.claimed_at := null;
    return new;
  end if;
  if current_setting('hentity.counter', true) = 'on' then return new; end if;
  listing := old.status = 'live' and old.claimed_at is not null and old.week_id is null and old.launch_date is null;
  new.featured := old.featured; new.promoted := old.promoted; new.verified := old.verified;
  new.upvote_count := old.upvote_count; new.comment_count := old.comment_count; new.follower_count := old.follower_count;
  new.click_count := old.click_count; new.view_count := old.view_count; new.owner_id := old.owner_id;
  new.review_note := old.review_note; new.review_items := old.review_items; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
  new.claim := old.claim; new.claimed_at := old.claimed_at;
  if new.status <> old.status then
    if not ((old.status in ('draft','changes') and new.status = 'review')
         or (listing and new.status = 'review')
         or (old.status = 'review' and new.status = 'draft')
         or (old.status = 'scheduled' and new.status = 'draft')
         or (old.status in ('draft','changes','rejected') and new.status = 'archived')) then
      raise exception 'Status change % -> % is not allowed', old.status, new.status;
    end if;
    if new.status = 'review' then new.submitted_at := now(); end if;
  elsif old.status in ('review','live') and not listing then
    raise exception 'This product can''t be edited right now';
  elsif old.status = 'unclaimed' then
    raise exception 'Claim this page first';
  elsif old.status = 'scheduled' then
    if new.launch_date is not distinct from old.launch_date then raise exception 'This product can''t be edited right now'; end if;
    if old.launch_date is not null and public.launch_at(old.launch_date) <= now() then raise exception 'You’re already live, so the day can’t change'; end if;
  end if;
  if new.launch_date is not null and new.status in ('review','scheduled') and (new.launch_date is distinct from old.launch_date or new.status <> old.status) then
    if new.launch_date <= public.lagos_today() then raise exception 'DAY_PAST'; end if;
    if new.launch_date > public.lagos_today() + 35 then raise exception 'DAY_TOO_FAR'; end if;
    select count(*) into taken from products where launch_date = new.launch_date and status in ('review','scheduled','live') and id <> new.id;
    if taken >= public.day_capacity() then raise exception 'DAY_FULL'; end if;
  end if;
  return new;
end $$;

-- 2. Claims ----------------------------------------------------------------------------------------------------
create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'founder' check (role in ('founder','employee','agency')),
  method text not null default 'email' check (method in ('email','dns','docs')),
  email text,
  code_hash text, code_sent_at timestamptz, attempts int not null default 0,
  dns_token text, dns_req bigint, dns_checked_at timestamptz,
  docs jsonb not null default '[]'::jsonb,
  status text not null default 'started' check (status in ('started','verified','review','published','rejected','withdrawn')),
  note text,
  created_at timestamptz not null default now(), verified_at timestamptz, published_at timestamptz,
  unique (product_id, user_id)
);
alter table public.claims enable row level security;
drop policy if exists "claims own" on public.claims;
create policy "claims own" on public.claims for select using (user_id = auth.uid() or public.is_admin());
-- all writes go through the functions below

create or replace function public.site_domain(u text) returns text language sql immutable as $$
  select nullif(lower(regexp_replace(coalesce(u, ''), '^\s*(https?://)?(www\.)?([^/:?#\s]+).*$', '\3')), '');
$$;

-- What the claim page needs: the public page, my claim, and how many people are waiting
create or replace function public.claim_info(s text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'product', jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'tagline', p.tagline, 'website', p.website, 'domain', site_domain(p.website),
      'color', p.color, 'logo_url', p.logo_url, 'city', p.city, 'country', p.country, 'categories', p.categories, 'status', p.status,
      'facts', (select coalesce(jsonb_agg(f), '[]'::jsonb) from jsonb_array_elements(p.claim->'facts') f)),
    'claim', (select to_jsonb(c) - 'code_hash' - 'dns_req' from claims c where c.product_id = p.id and c.user_id = auth.uid()),
    'taken', exists (select 1 from claims c where c.product_id = p.id and c.status = 'published'),
    'followers', (select count(*) from follows f where f.target_type = 'product' and f.target_id = p.id),
    'asks', (select count(*) from notify_requests n where n.product_id = p.id))
  from products p where p.slug = s and (p.status = 'unclaimed' or p.owner_id = auth.uid());
$$;

create or replace function public.claim_start(s text, r text, m text, em text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p products; c claims; dom text; code text;
begin
  if auth.uid() is null then raise exception 'Sign in to claim this page' using errcode = 'P0001'; end if;
  select * into p from products where slug = s;
  if p.id is null or p.status <> 'unclaimed' then raise exception 'This page has already been claimed' using errcode = 'P0001'; end if;
  if r not in ('founder','employee','agency') or m not in ('email','dns','docs') then raise exception 'Pick a role and a way to verify' using errcode = 'P0001'; end if;
  dom := site_domain(p.website);
  insert into claims (product_id, user_id, role, method) values (p.id, auth.uid(), r, m)
    on conflict (product_id, user_id) do update set role = excluded.role, method = excluded.method
    returning * into c;
  if c.status in ('published') then raise exception 'You already own this page' using errcode = 'P0001'; end if;
  if c.status in ('rejected','withdrawn') then update claims set status = 'started', note = null where id = c.id; end if;

  if m = 'email' then
    em := lower(trim(coalesce(em, '')));
    if dom is null then raise exception 'We don''t have a website for this startup yet. Use company documents instead.' using errcode = 'P0001'; end if;
    if em !~ '^[^@\s]+@[^@\s]+$' or not (split_part(em, '@', 2) = dom or split_part(em, '@', 2) like '%.' || dom) then
      raise exception 'Use an email address ending in @%', dom using errcode = 'P0001';
    end if;
    if c.code_sent_at > now() - interval '45 seconds' and c.email = em then raise exception 'We just sent a code. Wait a moment before asking for another.' using errcode = 'P0001'; end if;
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    update claims set email = em, code_hash = encode(digest(c.id::text || code, 'sha256'), 'hex'), code_sent_at = now(), attempts = 0 where id = c.id;
    perform h_send_email(em, code || ' is your Hentity code for ' || p.name,
      '<p>Use this code to confirm you work at <b>' || p.name || '</b>:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:24px 0">' || code || '</p><p>It expires in 30 minutes. If you didn''t ask for it, you can ignore this email.</p>', 'Hentity');
  elsif m = 'dns' then
    if dom is null then raise exception 'We don''t have a website for this startup yet. Use company documents instead.' using errcode = 'P0001'; end if;
    if c.dns_token is null then update claims set dns_token = 'hentity-verify=' || encode(gen_random_bytes(12), 'hex') where id = c.id; end if;
  end if;
  return (select to_jsonb(x) - 'code_hash' - 'dns_req' from claims x where x.id = c.id);
end $$;

create or replace function public.claim_verify_code(cid uuid, code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c claims;
begin
  select * into c from claims where id = cid and user_id = auth.uid();
  if c.id is null then raise exception 'Start your claim again' using errcode = 'P0001'; end if;
  if c.status = 'verified' then return jsonb_build_object('status', 'verified'); end if;
  if c.code_hash is null or c.code_sent_at < now() - interval '30 minutes' then raise exception 'That code has expired. Send a new one.' using errcode = 'P0001'; end if;
  if c.attempts >= 6 then raise exception 'Too many tries. Send a new code.' using errcode = 'P0001'; end if;
  if encode(digest(c.id::text || trim(code), 'sha256'), 'hex') <> c.code_hash then
    update claims set attempts = attempts + 1 where id = c.id;   -- returned, not raised, so the count sticks
    return jsonb_build_object('status', 'wrong', 'left', greatest(0, 5 - c.attempts));
  end if;
  update claims set status = 'verified', verified_at = now(), code_hash = null where id = c.id;
  return jsonb_build_object('status', 'verified', 'via', 'email');
end $$;

-- DNS: ask Google's public DNS-over-HTTPS for the TXT records (pg_net is async, so the page polls this)
create or replace function public.claim_check_dns(cid uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, net as $$
declare c claims; dom text; body text; st int;
begin
  select * into c from claims where id = cid and user_id = auth.uid();
  if c.id is null or c.method <> 'dns' then raise exception 'Start your claim again' using errcode = 'P0001'; end if;
  if c.status = 'verified' then return jsonb_build_object('status', 'verified'); end if;
  select site_domain(website) into dom from products where id = c.product_id;
  if c.dns_req is not null then
    select status_code, content into st, body from net._http_response where id = c.dns_req;
    if st is not null then
      if body like '%' || c.dns_token || '%' then
        update claims set status = 'verified', verified_at = now() where id = c.id;
        return jsonb_build_object('status', 'verified', 'via', 'dns');
      end if;
      if c.dns_checked_at > now() - interval '20 seconds' then return jsonb_build_object('status', 'not_found', 'checked_at', c.dns_checked_at); end if;
    elsif c.dns_checked_at > now() - interval '20 seconds' then
      return jsonb_build_object('status', 'checking');
    end if;
  end if;
  update claims set dns_req = net.http_get('https://dns.google/resolve?name=' || dom || '&type=TXT'), dns_checked_at = now() where id = c.id;
  return jsonb_build_object('status', 'checking');
end $$;

-- Documents: files go to the private 'claims' bucket under <user id>/<claim id>/..., then a person reviews them
insert into storage.buckets (id, name, public) values ('claims', 'claims', false) on conflict (id) do nothing;
drop policy if exists "claims upload own" on storage.objects;
create policy "claims upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'claims' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "claims read own" on storage.objects;
create policy "claims read own" on storage.objects for select to authenticated
  using (bucket_id = 'claims' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

create or replace function public.claim_submit_docs(cid uuid, files jsonb, note_text text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c claims; pname text; a record;
begin
  select * into c from claims where id = cid and user_id = auth.uid();
  if c.id is null then raise exception 'Start your claim again' using errcode = 'P0001'; end if;
  if jsonb_array_length(coalesce(files, '[]')) < 2 then raise exception 'Add your company certificate and an ID' using errcode = 'P0001'; end if;
  update claims set method = 'docs', docs = files, note = note_text, status = 'review' where id = c.id;
  select name into pname from products where id = c.product_id;
  for a in select id from profiles where role in ('admin','moderator') loop
    perform notify(a.id, 'review', 'launches', 'New claim to review: <b>' || pname || '</b> sent company documents.', 'Claims', '/admin#claims', 'Review', auth.uid(), c.product_id);
  end loop;
  return jsonb_build_object('status', 'review');
end $$;

create or replace function public.claim_decide(cid uuid, ok boolean, why text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c claims; p products;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into c from claims where id = cid; select * into p from products where id = c.product_id;
  update claims set status = case when ok then 'verified' else 'rejected' end, verified_at = case when ok then now() end, note = why where id = cid;
  perform notify(c.user_id, 'review', 'launches',
    case when ok then 'Your claim for <b>' || p.name || '</b> was approved. Review the details and publish.' else 'Your claim for <b>' || p.name || '</b> wasn''t approved: ' || coalesce(why, 'the documents didn''t match') end,
    'Claims', '/claim/' || p.slug, case when ok then 'Continue' else null end, null, p.id);
end $$;

-- Publish: apply edits, hand the page to the team, tell everyone who was waiting
-- e = { name, tagline, facts: { <key>: { action: keep|edit|hide, value } } }
create or replace function public.claim_publish(cid uuid, e jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c claims; p products; facts jsonb; told int := 0; u record; nm text; tg text;
begin
  select * into c from claims where id = cid and user_id = auth.uid();
  if c.id is null or c.status <> 'verified' then raise exception 'Verify that you work there first' using errcode = 'P0001'; end if;
  select * into p from products where id = c.product_id for update;
  if p.status <> 'unclaimed' then raise exception 'This page has already been claimed' using errcode = 'P0001'; end if;
  nm := coalesce(nullif(trim(e->>'name'), ''), p.name); tg := left(coalesce(nullif(trim(e->>'tagline'), ''), p.tagline), 140);
  select coalesce(jsonb_agg(
      case coalesce(e->'facts'->(f->>'key')->>'action', 'keep')
        when 'hide' then f || jsonb_build_object('hidden', true)
        when 'edit' then f || jsonb_build_object('value', left(e->'facts'->(f->>'key')->>'value', 300), 'edited', true, 'hidden', false)
        else f || jsonb_build_object('hidden', false) end), '[]'::jsonb)
    into facts from jsonb_array_elements(coalesce(p.claim->'facts', '[]')) f;
  perform set_config('hentity.counter', 'on', true);   -- lets this function move owner/status past guard_product
  update products set name = nm, tagline = tg, owner_id = c.user_id, status = 'live', claimed_at = now(),
    claim = claim || jsonb_build_object('facts', facts, 'claimed_via', c.method, 'claimed_at', now())
  where id = p.id;
  perform set_config('hentity.counter', 'off', true);
  insert into product_makers (product_id, user_id, role, accepted)
    values (p.id, c.user_id, case c.role when 'founder' then 'Founder' when 'employee' then 'Team' else 'Agency' end, true)
    on conflict do nothing;
  update claims set status = 'published', published_at = now() where id = c.id;
  update claims set status = 'rejected', note = 'Someone else from the team claimed this page first' where product_id = p.id and id <> c.id and status in ('started','verified','review');
  for u in select distinct uid from (select follower_id uid from follows where target_type = 'product' and target_id = p.id
                                     union select user_id from notify_requests where product_id = p.id) x where uid <> c.user_id loop
    perform notify(u.uid, 'follow', 'followers', '<b>' || nm || '</b> joined Hentity. The team claimed their page.', 'Follow', '/products/' || p.slug, 'View', c.user_id, p.id);
    told := told + 1;
  end loop;
  delete from notify_requests where product_id = p.id;
  return jsonb_build_object('slug', p.slug, 'told', told, 'via', c.method);
end $$;

-- 3. Ask the team to join (re-uses notify_requests) and removal requests ----------------------------------------
create table if not exists public.removal_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null, email text not null, relation text, reason text,
  status text not null default 'open' check (status in ('open','removed','declined')),
  created_at timestamptz not null default now(), due_at timestamptz not null default now() + interval '48 hours', handled_at timestamptz
);
alter table public.removal_requests enable row level security;
drop policy if exists "removals admin" on public.removal_requests;
create policy "removals admin" on public.removal_requests for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.request_removal(s text, nm text, em text, rel text, why text) returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid; pname text; a record;
begin
  select id, name into pid, pname from products where slug = s and status = 'unclaimed';
  if pid is null then raise exception 'This page can''t be found' using errcode = 'P0001'; end if;
  if coalesce(trim(nm), '') = '' or coalesce(em, '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Add your name and email' using errcode = 'P0001'; end if;
  if (select count(*) from removal_requests where email = lower(em) and created_at > now() - interval '1 day') >= 5 then raise exception 'We already have your request' using errcode = 'P0001'; end if;
  insert into removal_requests (product_id, name, email, relation, reason) values (pid, left(trim(nm), 120), lower(trim(em)), left(rel, 60), left(why, 1000));
  for a in select id from profiles where role in ('admin','moderator') loop
    perform notify(a.id, 'review', 'launches', 'Removal request for <b>' || pname || '</b>. Due within 48 hours.', 'Removals', '/admin#removals', 'Review', null, pid);
  end loop;
end $$;

create or replace function public.removal_decide(rid uuid, remove boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r removal_requests;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from removal_requests where id = rid;
  if remove then
    update products set status = 'archived', claim = claim || jsonb_build_object('removed_at', now(), 'never_readd', true) where id = r.product_id and status = 'unclaimed';
    perform h_send_email(r.email, 'We removed the page you asked about', '<p>Hi ' || r.name || ',</p><p>The Hentity page you asked about has been removed and won''t be added again.</p>', 'Hentity');
  end if;
  update removal_requests set status = case when remove then 'removed' else 'declined' end, handled_at = now() where id = rid;
end $$;

-- 4. Radar: candidates a person approves before anything is public ------------------------------------------------
create table if not exists public.radar (
  id uuid primary key default gen_random_uuid(),
  name text not null, website text, tagline text default '', description text default '',
  country text, city text, categories text[] not null default '{}',
  facts jsonb not null default '[]'::jsonb, news jsonb not null default '[]'::jsonb,
  contact_email text, found_via text, confidence int not null default 50,
  checks jsonb not null default '{}'::jsonb,
  status text not null default 'review' check (status in ('review','published','rejected','merged')),
  dup_of uuid references public.products(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), decided_at timestamptz
);
alter table public.radar enable row level security;
drop policy if exists "radar admin" on public.radar;
create policy "radar admin" on public.radar for all using (public.is_admin()) with check (public.is_admin());

-- duplicate check: same domain or very similar name
create or replace function public.radar_dupe(rid uuid) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select p.id from radar r join products p on (site_domain(p.website) = site_domain(r.website) and site_domain(r.website) is not null)
     or similarity(lower(p.name), lower(r.name)) > 0.6
  where r.id = rid and p.status not in ('archived','rejected') order by (site_domain(p.website) = site_domain(r.website)) desc limit 1;
$$;

create or replace function public.radar_publish(rid uuid, invite boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r radar; sl text; pid uuid; n int := 0; src int;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from radar where id = rid;
  if r.status <> 'review' then raise exception 'Already decided'; end if;
  if exists (select 1 from products where site_domain(website) = site_domain(r.website) and claim ? 'never_readd') then raise exception 'This startup asked to be removed. It can''t be added again.'; end if;
  sl := trim(both '-' from regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g'));
  if length(sl) < 2 then sl := sl || '-co'; end if;
  while exists (select 1 from products where slug = sl || case when n = 0 then '' else '-' || n end) loop n := n + 1; end loop;
  if n > 0 then sl := sl || '-' || n; end if;
  select count(distinct coalesce(f->>'source', '')) into src from jsonb_array_elements(r.facts) f;
  insert into products (slug, name, tagline, description, website, color, categories, country, city, status, owner_id, claim, stage, languages, platforms)
  values (sl, r.name, left(coalesce(r.tagline, ''), 140), coalesce(r.description, ''), coalesce(r.website, ''),
    (array['#16A34A','#2563EB','#9333EA','#EA580C','#0891B2','#B45309','#DB2777','#111111'])[1 + abs(hashtext(r.name)) % 8],
    r.categories, coalesce(r.country, 'NG'), coalesce(r.city, ''), 'unclaimed', null,
    jsonb_build_object('facts', r.facts, 'news', r.news, 'spotted_at', r.created_at, 'checked_at', now(), 'contact_email', r.contact_email,
      'sources', greatest(src, jsonb_array_length(r.news)), 'found_via', r.found_via), '', '', '')
  returning id into pid;
  update radar set status = 'published', product_id = pid, decided_at = now() where id = rid;
  if invite and r.contact_email ~ '@' then
    perform h_send_email(r.contact_email, r.name || ' is on Hentity. Claim your page',
      '<p>Hi ' || r.name || ' team,</p><p>Hentity is a launchpad for products built in Africa. We built a starter page for <b>' || r.name || '</b> from public sources (your website, news coverage and public registries).</p>'
      || '<p>Claim it in about 2 minutes to fix details, launch, and see who''s interested.</p>' || h_btn('https://hentity.com/claim/' || sl, 'Claim ' || r.name)
      || '<p style="color:#666">Not interested? <a href="https://hentity.com/products/' || sl || '?remove=1">Ask us to remove the page</a> and we won''t add it again.</p>', 'Hentity');
    update products set claim = claim || jsonb_build_object('invited_at', now()) where id = pid;
  end if;
  return jsonb_build_object('slug', sl, 'id', pid);
end $$;

-- 5. Insights count unclaimed profiles too ("Live" = the profile is public) ----------------------------------------
create or replace function public.insights(cc text default null, days int default 30) returns jsonb
language sql stable security definer set search_path = public as $$
  with pr as (
    select p.*, coalesce(p.launch_date, (coalesce(p.reviewed_at, p.created_at) at time zone 'Africa/Lagos')::date) as day
    from products p
    where p.status in ('scheduled','live','unclaimed') and (cc is null or cc = '' or p.country = cc)
  ),
  win as (select greatest(1, least(coalesce(days, 30), 730)) d, (now() at time zone 'Africa/Lagos')::date today),
  cur as (select pr.* from pr, win where pr.day > win.today - win.d and pr.day <= win.today),
  prev as (select pr.* from pr, win where pr.day > win.today - 2 * win.d and pr.day <= win.today - win.d),
  live as (select * from pr where status in ('live','unclaimed') or (status = 'scheduled' and day <= (select today from win))),
  cats as (select unnest(categories) c, day from pr),
  firstcity as (select city, country, min(day) first from pr where coalesce(city, '') <> '' group by city, country),
  views as (
    select
      count(*) filter (where b.created_at > now() - make_interval(days => (select d from win))) cur,
      count(*) filter (where b.created_at <= now() - make_interval(days => (select d from win)) and b.created_at > now() - make_interval(days => 2 * (select d from win))) prev
    from perf_beacons b
    where b.created_at > now() - make_interval(days => 2 * (select d from win))
      and (cc is null or cc = '' or (b.path like '/products/%' and split_part(b.path, '/', 3) in (select slug from pr)))
  )
  select jsonb_build_object(
    'days', (select d from win),
    'live', (select count(*) from live),
    'live_week', (select count(*) from live where day > (select today from win) - 7),
    'launched', (select count(*) from cur where status <> 'unclaimed'),
    'launched_prev', (select count(*) from prev where status <> 'unclaimed'),
    'unclaimed', (select count(*) from pr where status = 'unclaimed'),
    'views', (select cur from views),
    'views_prev', (select prev from views),
    'cities', (select count(*) from firstcity),
    'cities_new', (select count(*) from firstcity, win where first > win.today - win.d),
    'heat', (select coalesce(jsonb_object_agg(day, n), '{}'::jsonb) from (select day, count(*) n from pr, win where status <> 'unclaimed' and day > win.today - 371 and day <= win.today + 35 group by day) h),
    'industries', (select coalesce(jsonb_agg(jsonb_build_object('name', c, 'n', n, 'cur', cur, 'prev', prv) order by n desc, c), '[]'::jsonb) from (
        select c, count(*) n,
          count(*) filter (where day > (select today from win) - (select d from win)) cur,
          count(*) filter (where day <= (select today from win) - (select d from win) and day > (select today from win) - 2 * (select d from win)) prv
        from cats group by c) i),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('cc', country, 'n', n) order by n desc), '[]'::jsonb) from (select country, count(*) n from pr where coalesce(country, '') <> '' group by country) c),
    'city_list', (select coalesce(jsonb_agg(jsonb_build_object('city', city, 'cc', country, 'n', n, 'new', nw) order by n desc, city), '[]'::jsonb) from (
        select city, country, count(*) n, count(*) filter (where day > (select today from win) - (select d from win)) nw
        from pr where coalesce(city, '') <> '' group by city, country order by n desc, city limit 40) c),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('stage', stage, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(nullif(stage, ''), 'Unknown') stage, count(*) n from pr group by 1) s),
    'raised', (select coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'slug', p.slug, 'raised', c.raised, 'stage', c.stage, 'cc', p.country) order by p.upvote_count desc), '[]'::jsonb)
        from pr p join companies c on c.id = p.company_id where coalesce(c.raised, '') not in ('', 'Undisclosed')),
    'total', (select count(*) from pr)
  );
$$;

grant execute on function public.claim_info(text), public.request_removal(text, text, text, text, text) to anon, authenticated;
grant execute on function public.claim_start(text, text, text, text), public.claim_verify_code(uuid, text), public.claim_check_dns(uuid),
  public.claim_submit_docs(uuid, jsonb, text), public.claim_publish(uuid, jsonb), public.claim_decide(uuid, boolean, text),
  public.removal_decide(uuid, boolean), public.radar_publish(uuid, boolean), public.radar_dupe(uuid) to authenticated;
grant select on public.claims, public.radar, public.removal_requests to authenticated;
grant insert, update, delete on public.radar, public.removal_requests to authenticated;
