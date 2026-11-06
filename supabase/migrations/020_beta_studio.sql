-- Beta Studio (Figma: Studio page). A beta program now lives inside the maker's product workspace:
-- Details → Application form → Agreement → Access → Share, then Results. Testers come in through one public link
-- (/b/<slug>) from WhatsApp, the product page or anywhere: apply, sign the agreement, get personal access.
-- The /betas board is gone; open betas show as "Testers wanted" on their product.

-- ------------------------------------------------------------ tester accounts
-- People who arrive through a beta link can sign up with any email (they are testers, not makers).
-- They can't submit products until they use a work email.
alter table public.profiles add column if not exists kind text not null default 'member';
alter table public.profiles drop constraint if exists profiles_kind_check;
alter table public.profiles add constraint profiles_kind_check check (kind in ('member','tester'));

create or replace function public.enforce_work_email() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op = 'INSERT' and coalesce(new.raw_user_meta_data->>'via','') <> 'beta' and not public.work_email_ok(new.email) then
    raise exception 'WORK_EMAIL_REQUIRED: sign up with your work email';
  end if;
  if tg_op = 'UPDATE' and coalesce(new.email_change,'') <> '' and new.email_change is distinct from old.email_change
     and not public.work_email_ok(new.email_change) and not exists (select 1 from profiles where id = new.id and kind = 'tester') then
    raise exception 'WORK_EMAIL_REQUIRED: use your work email';
  end if;
  return new;
end $function$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-zA-Z0-9_]', '', 'g'));
  uname text;
  n int := 0;
begin
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 26);
  uname := base;
  while exists (select 1 from profiles where username = uname) loop
    n := n + 1; uname := base || n;
  end loop;
  insert into profiles (id, username, name, email, role, avatar_url, kind)
  values (new.id, uname,
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', initcap(split_part(new.email,'@',1))),
          new.email,
          case when lower(new.email) = 'chi@encir.co' then 'admin' else 'user' end,
          new.raw_user_meta_data->>'avatar_url',
          case when coalesce(new.raw_user_meta_data->>'via','') = 'beta' and not public.work_email_ok(new.email) then 'tester' else 'member' end);
  return new;
end $function$;

-- kind is set by the system only; a tester becomes a member when they switch to a work email
create or replace function public.guard_profile_kind() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or current_setting('hentity.counter', true) = 'on' then return new; end if;
  new.kind := old.kind;
  if old.kind = 'tester' and new.email is distinct from old.email and public.work_email_ok(new.email) then new.kind := 'member'; end if;
  return new;
end $$;
drop trigger if exists guard_profile_kind on public.profiles;
create trigger guard_profile_kind before update on public.profiles for each row execute function public.guard_profile_kind();

create or replace function public.testers_cant_submit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and exists (select 1 from profiles where id = auth.uid() and kind = 'tester') then
    raise exception 'Tester accounts can’t submit products. Sign up with your work email to launch on Hentity.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists testers_cant_submit on public.products;
create trigger testers_cant_submit before insert on public.products for each row execute function public.testers_cant_submit();

-- ------------------------------------------------------------ betas: studio fields
alter table public.betas add column if not exists slug text;
alter table public.betas add column if not exists form jsonb not null default '[]'::jsonb;        -- [{id,type,q,options[],required,must[],access}]
alter table public.betas add column if not exists agreement jsonb not null default '{}'::jsonb;   -- {legal_name,rc,law,contact,city,clauses:{key:bool},signer}
alter table public.betas add column if not exists access jsonb not null default '{}'::jsonb;      -- public toggles only: {android,web,ios,codes}
alter table public.betas add column if not exists settings jsonb not null default '{"show_on_product":true,"close_when_full":true,"auto_accept":false}'::jsonb;
alter table public.betas add column if not exists opens int not null default 0;
alter table public.betas add column if not exists signed_count int not null default 0;
alter table public.betas add column if not exists completed_at timestamptz;
create unique index if not exists betas_slug on public.betas(slug);
alter table public.betas drop constraint if exists betas_slug_check;
alter table public.betas add constraint betas_slug_check check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,59}$');
-- a draft can start with a short working title
alter table public.betas drop constraint if exists betas_title_check;
alter table public.betas add constraint betas_title_check check (char_length(title) between 3 and 80);

create or replace function public.h_slug(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(t,'')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.beta_slug() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; s text; n int := 1; pslug text;
begin
  if tg_op = 'UPDATE' and new.slug is not distinct from old.slug then return new; end if;
  if new.slug is not null and new.slug <> '' then
    new.slug := left(public.h_slug(new.slug), 60);
    if exists (select 1 from betas where slug = new.slug and id <> new.id) then raise exception 'That link is taken. Try another.' using errcode = 'P0001'; end if;
    return new;
  end if;
  select slug into pslug from products where id = new.product_id;
  base := left(public.h_slug(pslug || '-' || array_to_string((regexp_split_to_array(public.h_slug(regexp_replace(new.title, '\m(beta|test|testing|our|the|help)\M', '', 'gi')), '-'))[1:2], '-')), 50);
  base := trim(both '-' from base);
  if char_length(base) < 3 then base := base || '-beta'; end if;
  s := base;
  while exists (select 1 from betas where slug = s and id <> new.id) loop n := n + 1; s := base || '-' || n; end loop;
  new.slug := s;
  return new;
end $$;
drop trigger if exists beta_slug on public.betas;
create trigger beta_slug before insert or update of slug on public.betas for each row execute function public.beta_slug();
-- fill slugs for existing betas
do $$ declare r record; begin
  for r in select id from betas where slug is null loop
    perform set_config('hentity.counter', 'on', true);
    update betas set slug = '' where id = r.id;
    perform set_config('hentity.counter', 'off', true);
  end loop;
end $$;

-- private access settings (only the maker and admins): Play group, opt-in link, web base URL, TestFlight link
alter table public.beta_access add column if not exists config jsonb not null default '{}'::jsonb;

-- promo / licence codes, one per tester
create table if not exists public.beta_codes (
  id uuid primary key default gen_random_uuid(),
  beta_id uuid not null references public.betas(id) on delete cascade,
  code text not null check (char_length(code) between 1 and 120),
  application_id uuid references public.beta_applications(id) on delete set null,
  assigned_at timestamptz,
  unique (beta_id, code)
);
alter table public.beta_codes enable row level security;
drop policy if exists "codes maker" on public.beta_codes;
create policy "codes maker" on public.beta_codes for all using (public.owns_beta(beta_id)) with check (public.owns_beta(beta_id));
grant select, insert, update, delete on public.beta_codes to authenticated;

-- tracked links: "WhatsApp · Balogun traders group" → /b/<slug>?s=<code>
create table if not exists public.beta_links (
  id uuid primary key default gen_random_uuid(),
  beta_id uuid not null references public.betas(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]{1,24}$'),
  label text not null check (char_length(label) between 1 and 60),
  opens int not null default 0,
  created_at timestamptz not null default now(),
  unique (beta_id, code)
);
alter table public.beta_links enable row level security;
drop policy if exists "links maker" on public.beta_links;
create policy "links maker" on public.beta_links for all using (public.owns_beta(beta_id)) with check (public.owns_beta(beta_id));
grant select, insert, update, delete on public.beta_links to authenticated;

-- ------------------------------------------------------------ applications: identity, screening, signature
alter table public.beta_applications add column if not exists full_name text not null default '';
alter table public.beta_applications add column if not exists city text not null default '';
alter table public.beta_applications add column if not exists country text not null default '';
alter table public.beta_applications add column if not exists source text not null default '';
alter table public.beta_applications add column if not exists flags text[] not null default '{}';
alter table public.beta_applications add column if not exists signed_at timestamptz;
alter table public.beta_applications add column if not exists signed_name text;
alter table public.beta_applications add column if not exists sign_meta jsonb;

-- phone numbers are private: the maker sees one only after accepting that tester
create table if not exists public.beta_contacts (
  application_id uuid primary key references public.beta_applications(id) on delete cascade,
  beta_id uuid not null references public.betas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null default ''
);
alter table public.beta_contacts enable row level security;
drop policy if exists "contact own" on public.beta_contacts;
create policy "contact own" on public.beta_contacts for select using (user_id = auth.uid() or public.is_admin());

-- personal invite links (web) and device tracking; read only through RPCs
create table if not exists public.beta_invites (
  application_id uuid primary key references public.beta_applications(id) on delete cascade,
  beta_id uuid not null references public.betas(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  devices text[] not null default '{}',
  opens int not null default 0,
  last_open timestamptz,
  revoked boolean not null default false,
  revoked_reason text,
  created_at timestamptz not null default now()
);
alter table public.beta_invites enable row level security;

create or replace function public.is_beta_tester(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from beta_applications where beta_id = b and user_id = auth.uid() and status = 'accepted' and signed_at is not null);
$$;

create or replace function public.beta_recount(b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('hentity.counter', 'on', true);
  update betas set
    applied_count = (select count(*) from beta_applications where beta_id = b and status <> 'left'),
    accepted_count = (select count(*) from beta_applications where beta_id = b and status = 'accepted'),
    signed_count = (select count(*) from beta_applications where beta_id = b and status = 'accepted' and signed_at is not null),
    feedback_count = (select count(*) from beta_feedback where beta_id = b)
  where id = b;
  perform set_config('hentity.counter', 'off', true);
end $$;

-- generic email through Resend (send-only key in Vault); never callable by clients
create or replace function public.h_send_email(to_addr text, subj text, html text, from_name text default 'Hentity Betas') returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if coalesce(to_addr, '') !~ '@' then return; end if;
  begin
    select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_review_alerts' limit 1;
    if k is null then return; end if;
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', from_name || ' <noreply@hentity.com>', 'to', jsonb_build_array(to_addr), 'subject', subj,
        'html', '<div style="font-family:Arial,sans-serif;max-width:560px;color:#111;line-height:1.5">' || html || '<p style="color:#888;font-size:12px;margin-top:32px">Hentity · launch board for African makers</p></div>'));
  exception when others then raise warning 'email failed: %', sqlerrm;
  end;
end $$;
revoke execute on function public.h_send_email(text, text, text, text) from public, anon, authenticated;

create or replace function public.h_btn(href text, label text) returns text language sql immutable as $$
  select '<p style="margin:24px 0"><a href="' || href || '" style="background:#FF5A1F;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">' || label || '</a></p>';
$$;

-- Applications: the beta's form decides what's required; screening rules flag applicants; auto-accept full matches
create or replace function public.guard_beta_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare bt betas; pr profiles; plat text; score int := 0; total int := 0; r text; q jsonb; ans jsonb; vals text[]; fl text[] := '{}';
begin
  select * into bt from betas where id = new.beta_id;
  if tg_op = 'UPDATE' and current_setting('hentity.counter', true) = 'on' then return new; end if;   -- system updates
  if tg_op = 'INSERT' then
    if bt.status <> 'open' or bt.closes_at <= now() then raise exception 'This beta is no longer taking applications' using errcode = 'P0001'; end if;
    if bt.owner_id = auth.uid() then raise exception 'You can’t apply to your own beta' using errcode = 'P0001'; end if;
    new.user_id := auth.uid(); new.perk_released_at := null; new.decided_at := null; new.tasks_done := '{}';
    if exists (select 1 from profiles where id = auth.uid() and banned) then raise exception 'Your account can’t apply right now' using errcode = 'P0001'; end if;
    if bt.nda and not new.nda_ok and new.signed_at is null then raise exception 'Please agree to keep this beta private' using errcode = 'P0001'; end if;
    if coalesce((bt.settings->>'close_when_full')::boolean, true) and bt.accepted_count >= bt.spots then
      raise exception 'This beta is full. Thanks for your interest!' using errcode = 'P0001';
    end if;
    -- signatures only come through beta_apply / beta_sign
    if current_setting('hentity.signing', true) is distinct from 'on' then new.signed_at := null; new.signed_name := null; new.sign_meta := null; end if;
    -- required questions and screening
    for q in select * from jsonb_array_elements(coalesce(bt.form, '[]'::jsonb)) loop
      select x->'a' into ans from jsonb_array_elements(coalesce(new.answers, '[]'::jsonb)) x where x->>'id' = q->>'id' limit 1;
      vals := case when ans is null or ans = 'null'::jsonb then '{}'
                   when jsonb_typeof(ans) = 'array' then array(select jsonb_array_elements_text(ans))
                   else array[ans #>> '{}'] end;
      vals := array(select v from unnest(vals) v where btrim(v) <> '');
      if coalesce((q->>'required')::boolean, false) and cardinality(vals) = 0 and q->>'type' not in ('voice','file') then
        raise exception 'Answer “%”', q->>'q' using errcode = 'P0001';
      end if;
      if jsonb_array_length(coalesce(q->'must', '[]'::jsonb)) > 0
         and not exists (select 1 from jsonb_array_elements_text(q->'must') m where m = any(vals)) then
        fl := fl || ('Didn’t pick ' || (select string_agg(m, ' or ') from jsonb_array_elements_text(q->'must') m));
      end if;
    end loop;
    new.flags := fl;
    new.status := case when bt.accepted_count >= bt.spots then 'waitlist' else 'applied' end;
  else
    if not public.owns_beta(old.beta_id) then
      new.user_id := old.user_id; new.beta_id := old.beta_id; new.perk_released_at := old.perk_released_at; new.decided_at := old.decided_at;
      new.flags := old.flags; new.source := old.source;
      if current_setting('hentity.signing', true) is distinct from 'on' then new.signed_at := old.signed_at; new.signed_name := old.signed_name; new.sign_meta := old.sign_meta; end if;
      if new.status <> old.status and new.status <> 'left' then new.status := old.status; end if;
    else
      if current_setting('hentity.signing', true) is distinct from 'on' then
        new.signed_at := old.signed_at; new.signed_name := old.signed_name; new.sign_meta := old.sign_meta;
      end if;
      if old.user_id <> auth.uid() then new.answers := old.answers; new.flags := old.flags; new.full_name := old.full_name; end if;
      if new.status in ('accepted','declined') and new.status is distinct from old.status then new.decided_at := now(); end if;
      if new.status = 'accepted' and old.status <> 'accepted' and bt.accepted_count >= bt.spots then
        raise exception 'All % spots are filled. Add spots or decline someone first.', bt.spots using errcode = 'P0001';
      end if;
    end if;
  end if;
  -- match: country, platform, then each requirement the applicant confirmed
  select * into pr from profiles where id = new.user_id;
  total := 2 + coalesce(cardinality(bt.requirements), 0);
  if cardinality(bt.countries) = 0 or coalesce(nullif(new.country, ''), pr.country) = any(bt.countries) then score := score + 1; end if;
  plat := public.platform_of(coalesce(nullif(new.device_os,''), pr.device_os), coalesce(nullif(new.device,''), pr.device));
  if cardinality(bt.platforms) = 0 or plat = any(bt.platforms) then score := score + 1; end if;
  foreach r in array coalesce(bt.requirements, '{}') loop
    if r = any(new.confirmed) then score := score + 1; end if;
  end loop;
  new.match_score := score; new.match_total := total;
  -- auto-accept: full match, no screening flags, signed, a spot left
  if tg_op = 'INSERT' and new.status = 'applied' and coalesce((bt.settings->>'auto_accept')::boolean, false)
     and score = total and cardinality(new.flags) = 0 and new.signed_at is not null and bt.accepted_count < bt.spots then
    new.status := 'accepted'; new.decided_at := now();
  end if;
  return new;
end $$;

-- After an application changes: counts, notifications, emails, the testers' room, invite links and codes
create or replace function public.after_beta_application() returns trigger
language plpgsql security definer set search_path = public as $$
declare bt betas; pname text; who text; em text; link text; first text; accepted_now boolean;
begin
  select * into bt from betas where id = coalesce(new.beta_id, old.beta_id);
  perform public.beta_recount(bt.id);
  if tg_op = 'DELETE' then return old; end if;
  select name into pname from products where id = bt.product_id;
  select coalesce(nullif(new.full_name, ''), name), email into who, em from profiles where id = new.user_id;
  first := split_part(who, ' ', 1);
  link := 'https://hentity.com/b/' || bt.slug;
  accepted_now := new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted');
  if tg_op = 'INSERT' then
    if bt.owner_id is not null then
      insert into notifications (user_id, type, grp, actor_id, product_id, title, body, link, action_label)
      values (bt.owner_id, 'beta_applied', 'launches', new.user_id, bt.product_id,
        '<b>' || h_esc(who) || '</b> applied to test ' || h_esc(pname),
        case when cardinality(new.flags) > 0 then 'Flagged: ' || h_esc(new.flags[1]) else 'Match ' || new.match_score || '/' || new.match_total end,
        '/betas/' || bt.id || '/manage', 'Review');
    end if;
    if not accepted_now then
      perform public.h_send_email(em, 'Application sent: ' || pname || ' beta',
        '<h2 style="margin:0 0 8px">Thanks, ' || h_esc(first) || '!</h2><p>Your application to test <b>' || h_esc(pname) || '</b> is in'
        || case when new.signed_at is not null then ' and your agreement is signed' else '' end || '. ' || h_esc(pname)
        || ' picks testers by ' || to_char(bt.closes_at at time zone 'Africa/Lagos', 'FMDD Mon') || '. We’ll email you either way.</p>'
        || public.h_btn(link, 'View your application'));
    end if;
  end if;
  if accepted_now then
    insert into notifications (user_id, type, grp, product_id, title, body, link, action_label)
    values (new.user_id, 'beta_accepted', 'launches', bt.product_id,
      'You’re in! <b>' || h_esc(pname) || '</b> picked you to test', h_esc(bt.title), '/b/' || bt.slug, 'Get the beta');
    if bt.room_id is not null then
      insert into channel_members (channel_id, user_id) values (bt.room_id, new.user_id) on conflict do nothing;
    end if;
    insert into beta_invites (application_id, beta_id) values (new.id, bt.id) on conflict (application_id) do update set revoked = false, revoked_reason = null;
    if coalesce((bt.access->>'codes')::boolean, false) then
      update beta_codes set application_id = new.id, assigned_at = now()
      where id = (select id from beta_codes where beta_id = bt.id and application_id is null order by code limit 1)
        and not exists (select 1 from beta_codes where beta_id = bt.id and application_id = new.id);
    end if;
    perform public.h_send_email(em, 'You’re in: ' || pname || ' beta',
      '<h2 style="margin:0 0 8px">You’re in, ' || h_esc(first) || '!</h2><p><b>' || h_esc(pname) || '</b> accepted you to test “' || h_esc(bt.title) || '”.'
      || case when new.signed_at is null then ' Sign the short tester agreement to get your access.' else ' Your agreement is signed, so your access is ready.' end || '</p>'
      || public.h_btn(link, case when new.signed_at is null then 'Sign and get access' else 'Get the beta' end));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'declined' then
      insert into notifications (user_id, type, grp, product_id, title, body, link)
      values (new.user_id, 'beta_declined', 'launches', bt.product_id,
        h_esc(pname) || ' filled its beta', 'Thanks for applying. You keep your place for their next beta.', '/b/' || bt.slug);
      perform public.h_send_email(em, pname || ' filled its beta',
        '<p>Hi ' || h_esc(first) || ',</p><p>Thanks for applying to test <b>' || h_esc(pname) || '</b>. Every spot is taken this time, and you keep your place for their next beta.</p>');
    end if;
    if new.status in ('declined','left') then
      if bt.room_id is not null then delete from channel_members where channel_id = bt.room_id and user_id = new.user_id; end if;
      update beta_invites set revoked = true, revoked_reason = case when new.status = 'left' then 'Left the beta' else 'Declined' end where application_id = new.id;
    end if;
  end if;
  return new;
end $$;

-- Apply (and sign) in one call from /b/<slug>
create or replace function public.beta_apply(b uuid, full_name text, phone text, city text, country text, answers jsonb,
  device text, device_os text, source text, signed_name text, share_email boolean default true, ua text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare bt betas; a beta_applications; nm text := btrim(coalesce(full_name, '')); sn text := btrim(coalesce(signed_name, ''));
begin
  if auth.uid() is null then raise exception 'Confirm your email first' using errcode = 'P0001'; end if;
  select * into bt from betas where id = b;
  if bt.id is null then raise exception 'Beta not found' using errcode = 'P0001'; end if;
  if char_length(nm) < 3 then raise exception 'Enter your full name' using errcode = 'P0001'; end if;
  if coalesce(phone, '') !~ '^\+?[0-9 ()-]{8,18}$' then raise exception 'Enter your WhatsApp number with country code' using errcode = 'P0001'; end if;
  if lower(regexp_replace(sn, '\s+', ' ', 'g')) <> lower(regexp_replace(nm, '\s+', ' ', 'g')) then
    raise exception 'Type your full name exactly as above to sign' using errcode = 'P0001';
  end if;
  if exists (select 1 from beta_applications where beta_id = b and user_id = auth.uid()) then
    raise exception 'You’ve already applied to this beta' using errcode = 'P0001';
  end if;
  perform set_config('hentity.signing', 'on', true);
  insert into beta_applications (beta_id, user_id, answers, device, device_os, share_email, nda_ok, full_name, city, country, source, signed_at, signed_name, sign_meta)
  values (b, auth.uid(), coalesce(answers, '[]'::jsonb), left(coalesce(device, ''), 60), left(coalesce(device_os, ''), 40), coalesce(share_email, true), true,
    left(nm, 80), left(coalesce(city, ''), 60), left(coalesce(country, ''), 2), left(coalesce(source, ''), 24), now(), left(sn, 80),
    jsonb_build_object('phone_tail', right(regexp_replace(phone, '[^0-9]', '', 'g'), 4), 'ua', left(coalesce(ua, ''), 200), 'version', 1,
      'agreement', bt.agreement, 'perk', public.beta_perk_text(bt), 'product', (select name from products where id = bt.product_id)))
  returning * into a;
  perform set_config('hentity.signing', 'off', true);
  insert into beta_contacts (application_id, beta_id, user_id, phone) values (a.id, b, auth.uid(), regexp_replace(phone, '[^0-9+]', '', 'g'))
  on conflict (application_id) do update set phone = excluded.phone;
  -- profile: fill blanks so the next beta is one tap
  update profiles set
    country = coalesce(nullif(profiles.country, ''), nullif(beta_apply.country, '')),
    city = coalesce(nullif(profiles.city, ''), nullif(beta_apply.city, '')),
    device = coalesce(nullif(profiles.device, ''), nullif(beta_apply.device, '')),
    device_os = coalesce(nullif(profiles.device_os, ''), nullif(beta_apply.device_os, ''))
  where id = auth.uid();
  select * into a from beta_applications where id = a.id;
  return jsonb_build_object('id', a.id, 'status', a.status, 'flags', a.flags, 'signed_at', a.signed_at);
end $$;

-- Sign later (an application made before agreements, or accepted then asked to sign)
create or replace function public.beta_sign(app uuid, signed_name text, ua text default '') returns timestamptz
language plpgsql security definer set search_path = public as $$
declare a beta_applications; bt betas; nm text;
begin
  select * into a from beta_applications where id = app;
  if a.user_id is distinct from auth.uid() then raise exception 'Not your application'; end if;
  if a.status not in ('applied','waitlist','accepted') then raise exception 'This application is closed' using errcode = 'P0001'; end if;
  select * into bt from betas where id = a.beta_id;
  nm := coalesce(nullif(a.full_name, ''), (select name from profiles where id = a.user_id));
  if char_length(btrim(coalesce(signed_name, ''))) < 3 then raise exception 'Type your full name to sign' using errcode = 'P0001'; end if;
  perform set_config('hentity.signing', 'on', true);
  update beta_applications set signed_at = now(), signed_name = left(btrim(signed_name), 80),
    full_name = coalesce(nullif(full_name, ''), left(btrim(signed_name), 80)),
    sign_meta = jsonb_build_object('ua', left(coalesce(ua, ''), 200), 'version', 1, 'agreement', bt.agreement, 'perk', public.beta_perk_text(bt), 'product', (select name from products where id = bt.product_id))
  where id = app;
  perform set_config('hentity.signing', 'off', true);
  perform public.beta_recount(a.beta_id);
  return now();
end $$;

create or replace function public.beta_perk_text(bt betas) returns text language sql stable as $$
  select concat_ws(' + ', nullif(bt.perk, ''), case when bt.airtime_amount > 0 then '₦' || to_char(bt.airtime_amount, 'FM999,999') || ' airtime' end);
$$;

-- What a signed, accepted tester gets: personal links and codes. Nothing until both are true.
create or replace function public.my_beta_access(b uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a beta_applications; bt betas; cfg jsonb; inv beta_invites; code text; gmail text;
begin
  select * into a from beta_applications where beta_id = b and user_id = auth.uid();
  if a.id is null then return null; end if;
  select * into bt from betas where id = b;
  if a.status <> 'accepted' then return jsonb_build_object('state', a.status, 'signed', a.signed_at is not null); end if;
  if a.signed_at is null then return jsonb_build_object('state', 'unsigned'); end if;
  select config into cfg from beta_access where beta_id = b;
  select * into inv from beta_invites where application_id = a.id;
  if inv.application_id is null then
    insert into beta_invites (application_id, beta_id) values (a.id, b) returning * into inv;
  end if;
  if inv.revoked then return jsonb_build_object('state', 'revoked', 'reason', inv.revoked_reason); end if;
  select c.code into code from beta_codes c where c.application_id = a.id limit 1;
  select x->'a' #>> '{}' into gmail from jsonb_array_elements(a.answers) x where x->>'type' = 'email' or x->>'id' = 'gmail' limit 1;
  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'ready',
    'expires', bt.test_end,
    'signed_at', a.signed_at,
    'android', case when coalesce((bt.access->>'android')::boolean, false) then jsonb_build_object('optin', nullif(cfg->>'optin_url', ''), 'gmail', gmail) end,
    'web', case when coalesce((bt.access->>'web')::boolean, false) and coalesce(cfg->>'web_url', '') <> '' then jsonb_build_object('url', 'https://hentity.com/go/b/' || inv.token) end,
    'ios', case when coalesce((bt.access->>'ios')::boolean, false) then jsonb_build_object('url', nullif(cfg->>'testflight_url', '')) end,
    'code', code,
    'links', (select links from beta_access where beta_id = b)));
end $$;

-- Personal web link: count the open, track devices, revoke at 3+ devices, return where to send the tester.
-- Called by /go/b/<token> (anonymous). Makers can also verify ?invite=<token> with /api/beta-invite.
create or replace function public.beta_invite_open(t text, dev text, check_only boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv beta_invites; bt betas; cfg jsonb; a beta_applications; url text; d text := left(coalesce(dev, ''), 64);
begin
  select * into inv from beta_invites where token = t;
  if inv.application_id is null then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  select * into bt from betas where id = inv.beta_id;
  select * into a from beta_applications where id = inv.application_id;
  if inv.revoked or a.status <> 'accepted' or a.signed_at is null then return jsonb_build_object('ok', false, 'reason', coalesce(inv.revoked_reason, 'revoked')); end if;
  if bt.test_end is not null and now() > (bt.test_end + 1)::timestamp at time zone 'Africa/Lagos' then
    return jsonb_build_object('ok', false, 'reason', 'Beta ended');
  end if;
  if not check_only then
    if d <> '' and not d = any(inv.devices) then
      if cardinality(inv.devices) >= 2 then
        update beta_invites set revoked = true, revoked_reason = 'Opened on 3+ devices', devices = devices || d where application_id = inv.application_id;
        if bt.owner_id is not null then
          insert into notifications (user_id, type, grp, product_id, title, body, link)
          values (bt.owner_id, 'beta_revoked', 'launches', bt.product_id, 'Access revoked for <b>' || h_esc(a.full_name) || '</b>', 'Their personal link was opened on 3 devices.', '/betas/' || bt.id || '/manage');
        end if;
        return jsonb_build_object('ok', false, 'reason', 'Opened on 3+ devices');
      end if;
      update beta_invites set devices = devices || d where application_id = inv.application_id;
    end if;
    update beta_invites set opens = opens + 1, last_open = now() where application_id = inv.application_id;
  end if;
  select config into cfg from beta_access where beta_id = bt.id;
  url := coalesce(cfg->>'web_url', '');
  if url <> '' then url := url || case when position('?' in url) > 0 then '&' else '?' end || 'invite=' || t; end if;
  return jsonb_build_object('ok', true, 'url', url, 'tester', split_part(a.full_name, ' ', 1), 'beta', bt.slug, 'expires', bt.test_end);
end $$;

-- Link opens (anonymous), per source
create or replace function public.beta_track(s text, src text default '') returns void
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select id into b from betas where slug = s and status in ('open','closed');
  if b is null then return; end if;
  perform set_config('hentity.counter', 'on', true);
  update betas set opens = opens + 1 where id = b;
  perform set_config('hentity.counter', 'off', true);
  if coalesce(src, '') <> '' then update beta_links set opens = opens + 1 where beta_id = b and code = left(src, 24); end if;
end $$;

-- Maker: where applicants came from
create or replace function public.beta_sources(b uuid) returns table (code text, label text, opens int, applied int)
language sql stable security definer set search_path = public as $$
  with apps as (select source, count(*)::int n from beta_applications where beta_id = b and status <> 'left' group by source)
  select l.code, l.label, l.opens, coalesce(a.n, 0) from beta_links l left join apps a on a.source = l.code
  where l.beta_id = b and public.owns_beta(b)
  union all
  select a.source, case a.source when '' then 'Direct link' when 'product' then 'Hentity product page' else a.source end, null::int, a.n
  from apps a where public.owns_beta(b) and not exists (select 1 from beta_links l where l.beta_id = b and l.code = a.source)
  order by 4 desc;
$$;

-- Maker: funnel and results
create or replace function public.beta_results(b uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.owns_beta(b) then jsonb_build_object(
    'opens', bt.opens,
    'applied', (select count(*) from beta_applications where beta_id = b),
    'accepted', (select count(*) from beta_applications where beta_id = b and status in ('accepted','left') and decided_at is not null),
    'signed', (select count(*) from beta_applications where beta_id = b and status in ('accepted','left') and signed_at is not null and decided_at is not null),
    'used', (select count(*) from beta_applications a where beta_id = b and status in ('accepted','left') and (cardinality(a.tasks_done) > 0
              or exists (select 1 from beta_invites i where i.application_id = a.id and i.opens > 0)
              or exists (select 1 from beta_feedback f where f.application_id = a.id))),
    'feedback', bt.feedback_count,
    'ease', (select round(avg(ease)::numeric, 1) from beta_feedback where beta_id = b),
    'worked', (select round(100.0 * count(*) filter (where verdict in ('yes','mostly')) / greatest(count(*), 1)) from beta_feedback where beta_id = b),
    'top_tag', (select tag from beta_feedback where beta_id = b and tag <> '' group by tag order by count(*) desc limit 1),
    'top_tag_n', (select count(*) from beta_feedback where beta_id = b and tag <> '' group by tag order by count(*) desc limit 1),
    'fixed', (select count(*) from beta_feedback where beta_id = b and fixed),
    'paid', (select coalesce(sum(amount), 0) from beta_payouts where beta_id = b and status = 'sent'),
    'paid_n', (select count(*) from beta_payouts where beta_id = b and status = 'sent'),
    'unused', greatest(bt.spots - bt.signed_count, 0) * bt.airtime_amount
  ) end
  from betas bt where bt.id = b;
$$;

-- Maker: remind accepted testers who haven't signed
create or replace function public.beta_remind_sign(b uuid) returns int
language plpgsql security definer set search_path = public as $$
declare bt betas; pname text; r record; n int := 0;
begin
  if not public.owns_beta(b) then raise exception 'Only the maker can send reminders'; end if;
  select * into bt from betas where id = b; select name into pname from products where id = bt.product_id;
  for r in select a.id, a.user_id, coalesce(nullif(a.full_name, ''), p.name) nm, p.email from beta_applications a join profiles p on p.id = a.user_id
           where a.beta_id = b and a.status = 'accepted' and a.signed_at is null loop
    insert into notifications (user_id, type, grp, product_id, title, body, link, action_label)
    values (r.user_id, 'beta_sign', 'launches', bt.product_id, 'Sign to get the <b>' || h_esc(pname) || '</b> beta', 'One short agreement and your access is ready.', '/b/' || bt.slug, 'Sign');
    perform public.h_send_email(r.email, 'Sign to get the ' || pname || ' beta',
      '<p>Hi ' || h_esc(split_part(r.nm, ' ', 1)) || ',</p><p>You’re accepted to test <b>' || h_esc(pname) || '</b>. Sign the short tester agreement and your access is ready straight away.</p>' || public.h_btn('https://hentity.com/b/' || bt.slug, 'Sign and get access'));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Maker: revoke or restore one tester's access
create or replace function public.beta_set_access(app uuid, on_ boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a beta_applications;
begin
  select * into a from beta_applications where id = app;
  if not public.owns_beta(a.beta_id) then raise exception 'Only the maker can change access'; end if;
  insert into beta_invites (application_id, beta_id) values (app, a.beta_id) on conflict do nothing;
  update beta_invites set revoked = not on_, revoked_reason = case when on_ then null else 'Revoked by the maker' end,
    devices = case when on_ then '{}' else devices end where application_id = app;
end $$;

-- Maker view of applicants: phone only once accepted; signature, flags, source and access state
drop function if exists public.beta_applicants(uuid);
create or replace function public.beta_applicants(b uuid) returns table (
  id uuid, user_id uuid, name text, username text, avatar_url text, avatar_color text, country text, city text,
  device text, device_os text, answers jsonb, confirmed text[], status text, match_score int, match_total int,
  tasks_done int[], perk_released_at timestamptz, created_at timestamptz, email text, has_feedback boolean,
  phone text, flags text[], source text, signed_at timestamptz, invite_opens int, invite_devices int, revoked boolean, revoked_reason text, code text, kind text)
language sql stable security definer set search_path = public as $$
  select a.id, a.user_id, coalesce(nullif(a.full_name, ''), p.name), p.username, p.avatar_url, p.avatar_color,
         coalesce(nullif(a.country, ''), p.country), coalesce(nullif(a.city, ''), p.city),
         coalesce(nullif(a.device,''), p.device), coalesce(nullif(a.device_os,''), p.device_os), a.answers, a.confirmed, a.status,
         a.match_score, a.match_total, a.tasks_done, a.perk_released_at, a.created_at,
         case when a.share_email and a.status = 'accepted' then p.email end,
         exists (select 1 from beta_feedback f where f.application_id = a.id),
         case when a.status = 'accepted' then c.phone end,
         a.flags, a.source, a.signed_at, coalesce(i.opens, 0), coalesce(cardinality(i.devices), 0), coalesce(i.revoked, false), i.revoked_reason,
         (select bc.code from beta_codes bc where bc.application_id = a.id limit 1), p.kind
  from beta_applications a join profiles p on p.id = a.user_id
  left join beta_contacts c on c.application_id = a.id
  left join beta_invites i on i.application_id = a.id
  where a.beta_id = b and public.owns_beta(b)
  order by (a.status = 'accepted') desc, cardinality(a.flags), (a.match_score::float / greatest(a.match_total, 1)) desc, a.created_at;
$$;

-- Accept the N best: full matches with no screening flags first
create or replace function public.beta_accept_best(b uuid, n int) returns int
language plpgsql security definer set search_path = public as $$
declare bt betas; take int; done int := 0; a record;
begin
  if not public.owns_beta(b) then raise exception 'Only the maker can pick testers'; end if;
  select * into bt from betas where id = b;
  take := least(n, bt.spots - bt.accepted_count);
  for a in select id from beta_applications where beta_id = b and status in ('applied','waitlist')
           order by cardinality(flags), (match_score::float / greatest(match_total, 1)) desc, (signed_at is not null) desc, created_at asc limit greatest(take, 0) loop
    update beta_applications set status = 'accepted' where id = a.id; done := done + 1;
  end loop;
  return done;
end $$;

-- Close: marks the program completed (results stay)
create or replace function public.beta_complete(b uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_beta(b) then raise exception 'Only the maker can close this beta'; end if;
  perform set_config('hentity.counter', 'on', true);
  update betas set status = 'closed', completed_at = now() where id = b;
  update beta_invites set revoked = true, revoked_reason = 'Beta ended' where beta_id = b and not revoked;
  perform set_config('hentity.counter', 'off', true);
end $$;

-- Products: is there an open beta that wants testers?
create or replace view public.product_feed with (security_invoker = true) as
 select p.id, p.slug, p.name, p.tagline, p.description, p.website, p.color, p.logo_url, p.media, p.video_url, p.categories,
    p.country, p.city, p.countries, p.pay_methods, p.currencies, p.languages, p.platforms, p.stage, p.company_id, p.owner_id,
    p.status, p.week_id, p.intro, p.support_pledge, p.featured, p.promoted, p.verified, p.verify, p.review_note, p.review_items,
    p.submitted_at, p.reviewed_at, p.reviewed_by, p.upvote_count, p.comment_count, p.follower_count, p.click_count, p.view_count,
    p.created_at, p.updated_at,
    case when p.status = 'scheduled' and coalesce(public.launch_at(p.launch_date), w.starts_at) <= now() then 'live'::text else p.status end as effective_status,
    w.starts_at as week_starts_at, w.ends_at as week_ends_at,
    p.launch_date,
    exists (select 1 from betas b where b.product_id = p.id and b.status = 'open' and b.closes_at > now() and b.accepted_count < b.spots
            and coalesce((b.settings->>'show_on_product')::boolean, true)) as testers_wanted
 from products p left join weeks w on w.id = p.week_id;

-- Links in older notifications and functions pointed at /betas/<id>; payment/nudge notices now link the Studio dashboard route,
-- which is unchanged (/betas/<id>/manage). Beta stats for the header no longer exist as a board, but keep the RPC for admin.

grant execute on function public.beta_apply(uuid, text, text, text, text, jsonb, text, text, text, text, boolean, text) to authenticated;
grant execute on function public.beta_sign(uuid, text, text), public.my_beta_access(uuid), public.beta_sources(uuid), public.beta_results(uuid),
  public.beta_remind_sign(uuid), public.beta_set_access(uuid, boolean), public.beta_complete(uuid), public.beta_applicants(uuid) to authenticated;
grant execute on function public.beta_track(text, text), public.beta_invite_open(text, text, boolean) to anon, authenticated;
grant execute on function public.beta_perk_text(betas) to anon, authenticated;
revoke execute on function public.guard_profile_kind(), public.testers_cant_submit(), public.beta_slug() from public, anon, authenticated;
