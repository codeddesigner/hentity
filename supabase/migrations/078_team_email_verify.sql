-- Joining a team instantly: confirm a work email at the startup's own domain (from its website) with a
-- 6-digit code and you're added straight away. Without one, the request still goes to the founder.

create table if not exists public.team_codes (
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  role text not null default 'Co-founder',
  code_hash text not null,
  tries int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (product_id, user_id)
);
alter table public.team_codes enable row level security;   -- functions only

-- The startup's email domain, from its website. Null when the site is on a shared host (no one owns that domain).
create or replace function public.team_domain(pid uuid) returns text language sql stable security definer set search_path = public as $$
  select case when d is null or d = '' or d !~ '\.' or d ~ '(^|\.)(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|proton|protonmail|gmx|zoho|yandex|mail)\.[a-z.]+$'
      or d ~ '(^|\.)(vercel\.app|netlify\.app|github\.io|herokuapp\.com|web\.app|firebaseapp\.com|pages\.dev|onrender\.com|railway\.app|glitch\.me|replit\.app|repl\.co|wixsite\.com|wix\.com|squarespace\.com|webflow\.io|framer\.website|framer\.app|carrd\.co|notion\.site|super\.site|linktr\.ee|bio\.link|beacons\.ai|bit\.ly|wordpress\.com|blogspot\.com|medium\.com|substack\.com|shopify\.com|myshopify\.com|selar\.co|paystack\.shop|flutterwave\.com|google\.com|sites\.google\.com|play\.google\.com|apple\.com|apps\.apple\.com|instagram\.com|facebook\.com|x\.com|twitter\.com|linkedin\.com|tiktok\.com|youtube\.com|wa\.me|whatsapp\.com|t\.me|bubbleapps\.io|glide\.page|softr\.app|lovable\.app|bolt\.new|base44\.app)$'
    then null else d end
  from (select lower(regexp_replace(regexp_replace(coalesce(website, ''), '^\s*(https?://)?(www\.)?', ''), '[/:?#].*$', '')) d from products where id = pid) x;
$$;

create or replace function public.team_email_code(pid uuid, em text, rl text default 'Co-founder') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p products; dom text; edom text; code text; recent int;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  select * into p from products where id = pid;
  if p.id is null or p.owner_id is null then raise exception 'Product not found' using errcode = 'P0001'; end if;
  if p.owner_id = auth.uid() or exists (select 1 from product_makers where product_id = pid and user_id = auth.uid() and accepted) then raise exception 'You’re already on this team' using errcode = 'P0001'; end if;
  dom := public.team_domain(pid);
  if dom is null then raise exception '% doesn’t have its own website domain, so ask the founder to approve you instead', p.name using errcode = 'P0001'; end if;
  em := lower(trim(coalesce(em, '')));
  if em !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email' using errcode = 'P0001'; end if;
  edom := split_part(em, '@', 2);
  if not (edom = dom or edom like '%.' || dom) then raise exception 'Use your email at %', dom using errcode = 'P0001'; end if;
  select count(*) into recent from team_codes where user_id = auth.uid() and created_at > now() - interval '10 minutes';
  if recent >= 5 then raise exception 'Too many codes. Try again in a few minutes.' using errcode = 'P0001'; end if;
  code := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into team_codes (product_id, user_id, email, role, code_hash, expires_at)
  values (pid, auth.uid(), em, left(coalesce(nullif(trim(rl), ''), 'Co-founder'), 40), encode(extensions.digest(code || pid::text || auth.uid()::text, 'sha256'), 'hex'), now() + interval '15 minutes')
  on conflict (product_id, user_id) do update set email = excluded.email, role = excluded.role, code_hash = excluded.code_hash, expires_at = excluded.expires_at, tries = 0, created_at = now();
  perform public.h_resend(jsonb_build_object('from', 'Hentity <hello@hentity.com>', 'to', jsonb_build_array(em), 'subject', code || ' is your code to join ' || p.name || ' on Hentity',
    'html', public.h_email_layout('minimal', '', 'Your code: ' || code, 'Enter it on Hentity to join the ' || p.name || ' team. It works for 15 minutes.',
      '<p style="margin:0 0 12px">Someone signed in to Hentity asked to join <b>' || public.h_esc(p.name) || '</b> using this address.</p>'
      || '<p style="margin:0;font:600 28px/36px ''Geist Mono'',Menlo,monospace;letter-spacing:.2em;color:#0A0A0A">' || code || '</p>'
      || '<p style="margin:16px 0 0;color:#8A8A8A;font-size:13px">If that wasn’t you, ignore this email and nothing happens.</p>',
      null, 'You’re getting this because someone used this address to join a team on Hentity.', null)));
  return jsonb_build_object('sent', true, 'domain', dom);
end $$;

create or replace function public.team_email_verify(pid uuid, cd text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare c team_codes; p products; who profiles;
begin
  select * into c from team_codes where product_id = pid and user_id = auth.uid();
  if c.user_id is null or c.expires_at < now() then raise exception 'That code has expired. Send a new one.' using errcode = 'P0001'; end if;
  if c.tries >= 5 then raise exception 'Too many tries. Send a new code.' using errcode = 'P0001'; end if;
  if c.code_hash <> encode(extensions.digest(regexp_replace(coalesce(cd, ''), '\D', '', 'g') || pid::text || auth.uid()::text, 'sha256'), 'hex') then
    update team_codes set tries = tries + 1 where product_id = pid and user_id = auth.uid();
    raise exception 'That code isn’t right' using errcode = 'P0001';
  end if;
  delete from team_codes where product_id = pid and user_id = auth.uid();
  select * into p from products where id = pid;
  -- In straight away; the founder is told who joined and with which address
  insert into product_makers (product_id, user_id, role, accepted, requested) values (pid, auth.uid(), c.role, true, true)
  on conflict (product_id, user_id) do update set accepted = true, role = excluded.role;
  select * into who from profiles where id = auth.uid();
  insert into notifications (user_id, type, grp, title, body, link, actor_id, product_id)
  values (p.owner_id, 'team', 'system', coalesce(who.name, who.username) || ' joined ' || p.name, 'Verified with ' || c.email || ', as ' || c.role || '. Not right? Remove them in My products.', '/my-products?team=' || p.id, auth.uid(), p.id);
end $$;

grant execute on function public.team_domain(uuid) to anon, authenticated;
grant execute on function public.team_email_code(uuid, text, text), public.team_email_verify(uuid, text) to authenticated;
revoke execute on function public.team_email_code(uuid, text, text), public.team_email_verify(uuid, text) from anon;
