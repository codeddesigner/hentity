-- Claiming a page: the only way is a work email at the startup's own website domain, confirmed with a
-- 6-digit code. That's instant: no admin review. DNS records and document uploads are switched off.
-- Pages on a shared host or free email domain (vercel.app, gmail.com…) have no domain anyone owns, so
-- they can't be claimed this way (team_domain() decides, the same rule as joining a team).

create or replace function public.claim_info(s text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'product', jsonb_build_object('id', p.id, 'slug', p.slug, 'name', p.name, 'tagline', p.tagline, 'website', p.website, 'domain', public.team_domain(p.id),
      'site', site_domain(p.website),
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
declare p products; c claims; dom text; code text; edom text;
begin
  if auth.uid() is null then raise exception 'Sign in to claim this page' using errcode = 'P0001'; end if;
  select * into p from products where slug = s;
  if p.id is null or p.status <> 'unclaimed' then raise exception 'This page has already been claimed' using errcode = 'P0001'; end if;
  if r not in ('founder','employee','agency') then raise exception 'Pick your role' using errcode = 'P0001'; end if;
  if m <> 'email' then raise exception 'Pages are claimed with a work email at the startup’s own domain' using errcode = 'P0001'; end if;
  dom := public.team_domain(p.id);
  if dom is null then raise exception '% doesn’t have a website on its own domain, so it can’t be claimed with a work email', p.name using errcode = 'P0001'; end if;
  em := lower(trim(coalesce(em, '')));
  edom := split_part(em, '@', 2);
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or not (edom = dom or edom like '%.' || dom) then
    raise exception 'Use your email address at %', dom using errcode = 'P0001';
  end if;
  insert into claims (product_id, user_id, role, method) values (p.id, auth.uid(), r, 'email')
    on conflict (product_id, user_id) do update set role = excluded.role, method = 'email'
    returning * into c;
  if c.status = 'published' then raise exception 'You already own this page' using errcode = 'P0001'; end if;
  if c.status in ('rejected', 'withdrawn', 'review') then update claims set status = 'started', note = null where id = c.id; end if;
  if c.code_sent_at > now() - interval '45 seconds' and c.email = em then raise exception 'We just sent a code. Wait a moment before asking for another.' using errcode = 'P0001'; end if;
  if (select count(*) from claims where user_id = auth.uid() and code_sent_at > now() - interval '10 minutes') >= 6 then
    raise exception 'Too many codes. Try again in a few minutes.' using errcode = 'P0001'; end if;
  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  update claims set email = em, code_hash = encode(digest(c.id::text || code, 'sha256'), 'hex'), code_sent_at = now(), attempts = 0 where id = c.id;
  perform h_send_email(em, code || ' is your Hentity code for ' || p.name,
    '<p>Use this code to confirm you work at <b>' || h_esc(p.name) || '</b>:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold;margin:24px 0">' || code || '</p><p>It expires in 30 minutes. If you didn''t ask for it, you can ignore this email.</p>', 'Hentity');
  return (select to_jsonb(x) - 'code_hash' - 'dns_req' from claims x where x.id = c.id);
end $$;

create or replace function public.claim_check_dns(cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Pages are claimed with a work email at the startup’s own domain' using errcode = 'P0001';
end $$;

create or replace function public.claim_submit_docs(cid uuid, files jsonb, note_text text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Pages are claimed with a work email at the startup’s own domain' using errcode = 'P0001';
end $$;
