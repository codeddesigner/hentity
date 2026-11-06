-- Hentity emails, built from the Figma "Email" page (186:2): one header per kind of email, a shared body and footer.
-- Sent through Resend (key in vault: resend_review_alerts). Every send checks the member's notification settings,
-- respects "Pause all notifications", is logged once per (member, kind, ref) so nothing goes out twice, and carries
-- a one-click unsubscribe link.
--
--   welcome      Digest header      every new sign-up, once
--   digest       Digest header      "The Launchpad", Mondays 07:00 WAT, top launches of the week that just ended
--   potw         Launch header      makers whose product finished #1-#3 (sent with the digest)
--   launch_day   Launch header      the maker, 06:05 WAT on their launch day
--   find         Find header        new interest/application, match, NDA signed, role approved
--   insights     Insights header    1st of the month, 09:00 WAT
--   (other)      Minimal header     every older email (beta, claims, nudges) now uses this layout

create extension if not exists pg_cron;

create table if not exists public.email_log (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  kind text not null,
  ref text not null default '',
  to_addr text,
  subject text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
alter table public.email_log enable row level security;
drop policy if exists "email log admin" on public.email_log;
create policy "email log admin" on public.email_log for select using (public.is_admin());

-- Secret for unsubscribe links
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'email_unsub') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_unsub');
  end if;
end $$;

create or replace function public.h_unsub_token(uid uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(extensions.hmac(uid::text, (select decrypted_secret from vault.decrypted_secrets where name = 'email_unsub' limit 1), 'sha256'), 'hex');
$$;

create or replace function public.h_unsub_url(uid uuid, k text) returns text
language sql stable security definer set search_path = public as $$
  select 'https://hentity.com/unsubscribe?u=' || uid || '&k=' || k || '&t=' || public.h_unsub_token(uid);
$$;

-- May this member get this email? pref = settings key ('digest', 'find'...); null = always (welcome, receipts)
create or replace function public.h_email_ok(uid uuid, pref text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles u where u.id = uid and coalesce(u.email, '') ~ '@' and not u.banned and not u.is_seed
    and u.deletion_requested_at is null
    and (pref is null or (
      coalesce((u.settings ->> 'pause_until')::timestamptz, now() - interval '1 second') < now()
      and coalesce((u.settings -> 'notif' ->> (pref || '.1'))::boolean, true))));
$$;

create or replace function public.h_num(n bigint) returns text language sql immutable as $$ select to_char(coalesce(n, 0), 'FM999,999,999,990') $$;

-- Product mark for emails: logo image, or initials on the product colour
create or replace function public.h_email_logo(name text, logo text, color text, size int default 32) returns text
language sql immutable as $$
  select case when coalesce(logo, '') <> '' then
    '<img src="' || public.h_esc(logo) || '" width="' || size || '" height="' || size || '" alt="" style="display:block;width:' || size || 'px;height:' || size || 'px;border-radius:' || (size / 4) || 'px;border:0;object-fit:cover">'
  else '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="' || size || '" height="' || size || '" align="center" valign="middle" style="width:' || size || 'px;height:' || size || 'px;border-radius:' || (size / 4) || 'px;background:' || coalesce(nullif(color, ''), '#0A0A0A') || ';color:#fff;font:600 ' || (size * 0.4)::int || 'px Arial,Helvetica,sans-serif">'
    || public.h_esc(upper(left(regexp_replace(coalesce(name, '?'), '[^A-Za-z0-9 ]', '', 'g'), 1) || coalesce(substr(split_part(coalesce(name, ''), ' ', 2), 1, 1), ''))) || '</td></tr></table>' end;
$$;

create or replace function public.h_email_button(href text, label text) returns text language sql immutable as $$
  select '<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btnw"><tr><td class="btn" bgcolor="#FF5A1F" style="border-radius:10px;background:#FF5A1F"><a href="' || public.h_esc(href) || '" style="display:inline-block;padding:11px 18px;font:500 15px/18px Geist,Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:10px">' || public.h_esc(label) || '</a></td></tr></table>';
$$;

-- The whole email. typ: minimal | digest | launch | beta | find | insights
create or replace function public.h_email_layout(typ text, eyebrow text, title text, sub text, body text, uid uuid, reason text, unsub_key text, art text default null, pill text default null, view_url text default 'https://hentity.com')
returns text language plpgsql stable security definer set search_path = public as $$
declare bg text; ink text; muted text; eb text; logo text; art_html text; dark boolean; head text; foot text;
begin
  dark := typ = 'launch';
  bg := case typ when 'digest' then '#FFF3EA' when 'launch' then '#0A0A0A' when 'beta' then '#EAF3FF' when 'find' then '#E9FBF2' when 'insights' then '#F1EFFF' else '#FFFFFF' end;
  ink := case when dark then '#FFFFFF' else '#0A0A0A' end;
  muted := case when dark then '#A3A3A3' else '#6B6B6B' end;
  eb := case typ when 'beta' then '#2563EB' when 'find' then '#15803D' when 'insights' then '#6D4AFF' when 'launch' then '#FF8F57' else '#6B6B6B' end;
  logo := '<img src="https://hentity.com/email/' || case when dark then 'logo-white' else 'logo' end || '.png" width="132" height="24" alt="Hentity" style="display:block;border:0;width:132px;height:24px">';
  art_html := coalesce(art, case typ when 'digest' then '<img src="https://hentity.com/email/art-digest.png" width="168" height="110" alt="" style="display:block;border:0">'
    when 'beta' then '<img src="https://hentity.com/email/art-beta.png" width="128" height="128" alt="" style="display:block;border:0">'
    when 'find' then '<img src="https://hentity.com/email/art-find.png" width="128" height="128" alt="" style="display:block;border:0">'
    when 'insights' then '<img src="https://hentity.com/email/art-insights.png" width="124" height="120" alt="" style="display:block;border:0">' else '' end);
  head := '<tr><td class="px" bgcolor="' || bg || '" style="background:' || bg || ';padding:28px 40px ' || case when typ = 'minimal' then '24px' else '36px' end || ';' || case when typ = 'minimal' then 'border-bottom:1px solid #EAEAEA;' else '' end || '">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>' || logo || '</td><td align="right" style="font:400 12px/16px Geist,Arial,Helvetica,sans-serif"><a href="' || public.h_esc(view_url) || '" style="color:' || muted || ';text-decoration:none">' || case when typ = 'minimal' then 'hentity.com' else 'View on Hentity' end || '</a></td></tr></table>'
    || case when coalesce(title, '') = '' then '' else
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr><td valign="middle">'
      || case when pill is not null then '<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FF5A1F;color:#fff;font:500 12px/16px Geist,Arial,Helvetica,sans-serif;margin-bottom:12px">' || public.h_esc(pill) || '</span><br>' else '' end
      || case when coalesce(eyebrow, '') <> '' then '<p style="margin:0 0 10px;font:400 12px/16px ''Geist Mono'',Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:' || eb || '">' || public.h_esc(eyebrow) || '</p>' else '' end
      || '<h1 style="margin:0;font:600 ' || case when typ = 'minimal' then '24px/30px' else '32px/38px' end || ' Geist,Arial,Helvetica,sans-serif;letter-spacing:-0.02em;color:' || ink || '">' || public.h_esc(title) || '</h1>'
      || case when coalesce(sub, '') <> '' then '<p style="margin:10px 0 0;font:400 15px/22px Geist,Arial,Helvetica,sans-serif;color:' || muted || '">' || public.h_esc(sub) || '</p>' else '' end
      || '</td>' || case when art_html <> '' then '<td class="art" width="168" align="right" valign="middle" style="padding-left:24px">' || art_html || '</td>' else '' end || '</tr></table>' end
    || '</td></tr>';
  foot := '<tr><td class="px" bgcolor="#F7F7F7" style="background:#F7F7F7;padding:24px 40px 28px">'
    || '<img src="https://hentity.com/email/logo.png" width="132" height="24" alt="Hentity" style="display:block;border:0;width:132px;height:24px">'
    || '<p style="margin:12px 0 8px;font:400 12px/18px Geist,Arial,Helvetica,sans-serif;color:#8A8A8A">' || public.h_esc(coalesce(reason, 'You’re getting this because you have a Hentity account.')) || ' Hentity, Lagos, Nigeria.</p>'
    || '<p style="margin:0;font:400 12px/16px Geist,Arial,Helvetica,sans-serif"><a href="https://hentity.com/settings/notifications" style="color:#555;text-decoration:none">Email settings</a>'
    || case when uid is not null and unsub_key is not null then ' <span style="color:#BBB">·</span> <a href="' || public.h_unsub_url(uid, unsub_key) || '" style="color:#555;text-decoration:none">Unsubscribe</a>' else '' end || '</p></td></tr>';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">'
    || '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono&display=swap" rel="stylesheet">'
    || '<style>body{margin:0;padding:0;background:#F2F2F2}a{color:#FF5A1F}@media (max-width:620px){.wrap{width:100%!important}.px{padding-left:20px!important;padding-right:20px!important}.art{display:none!important}.btnw,.btnw td{width:100%!important}.btn a{display:block!important;text-align:center}}</style></head>'
    || '<body style="margin:0;padding:0;background:#F2F2F2"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F2F2F2"><tr><td align="center" style="padding:24px 12px">'
    || '<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden">'
    || head || '<tr><td class="px" style="padding:32px 40px 36px;font:400 15px/22px Geist,Arial,Helvetica,sans-serif;color:#3D3D3D">' || coalesce(body, '') || '</td></tr>' || foot
    || '</table></td></tr></table></body></html>';
end $$;

-- Low-level send through Resend. One email, or a list (sent with the batch endpoint, 100 at a time).
create or replace function public.h_resend(msgs jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k text; i int := 0; n int;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_review_alerts' limit 1;
  if k is null or msgs is null then return; end if;
  if jsonb_typeof(msgs) = 'object' then
    perform net.http_post(url := 'https://api.resend.com/emails', headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'), body := msgs);
    return;
  end if;
  n := jsonb_array_length(msgs);
  while i < n loop
    perform net.http_post(url := 'https://api.resend.com/emails/batch', headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body := (select jsonb_agg(e) from jsonb_array_elements(msgs) with ordinality t(e, o) where o > i and o <= i + 100));
    i := i + 100;
  end loop;
exception when others then raise warning 'email send failed: %', sqlerrm;
end $$;

-- Build one message for a member, or null if they shouldn't get it (settings, pause, already sent)
create or replace function public.h_email_msg(uid uuid, kind text, ref text, pref text, subj text, html text, from_name text default 'Hentity', from_local text default 'hello')
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text; ins int;
begin
  if not public.h_email_ok(uid, pref) then return null; end if;
  select email into em from profiles where id = uid;
  insert into email_log (user_id, kind, ref, to_addr, subject) values (uid, kind, coalesce(ref, ''), em, subj) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return null; end if;
  return jsonb_build_object('from', from_name || ' <' || from_local || '@hentity.com>', 'to', jsonb_build_array(em), 'subject', subj, 'html', html,
    'reply_to', 'hello@hentity.com',
    'headers', case when pref is not null then jsonb_build_object('List-Unsubscribe', '<' || public.h_unsub_url(uid, pref) || '>') else '{}'::jsonb end);
end $$;

create or replace function public.h_email_send(uid uuid, kind text, ref text, pref text, subj text, html text, from_name text default 'Hentity', from_local text default 'hello') returns boolean
language plpgsql security definer set search_path = public as $$
declare m jsonb;
begin
  m := public.h_email_msg(uid, kind, ref, pref, subj, html, from_name, from_local);
  if m is null then return false; end if;
  perform public.h_resend(m); return true;
end $$;

-- Older emails (beta, claims, nudges, review alerts) keep their wording but get the Minimal layout
create or replace function public.h_send_email(to_addr text, subj text, html text, from_name text default 'Hentity Betas') returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  if coalesce(to_addr, '') !~ '@' then return; end if;
  select id into uid from profiles where lower(email) = lower(to_addr) limit 1;
  perform public.h_resend(jsonb_build_object('from', from_name || ' <noreply@hentity.com>', 'to', jsonb_build_array(to_addr), 'subject', subj, 'reply_to', 'hello@hentity.com',
    'html', public.h_email_layout('minimal', null, null, null, html, uid, 'You’re getting this because of activity on your Hentity account.', null)));
end $$;

-- ===================================================================== welcome
create or replace function public.email_welcome(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles; first text; body text; live int;
begin
  select * into u from profiles where id = uid;
  if u.id is null then return; end if;
  first := split_part(coalesce(nullif(u.name, ''), 'there'), ' ', 1);
  select count(*) into live from product_feed where effective_status = 'live';
  body := '<p style="margin:0 0 20px">Hi ' || public.h_esc(first) || ', welcome to Hentity. Every week, founders from Lagos to Nairobi launch here and the community decides what rises. Here’s where to start:</p>'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">'
    || (select string_agg('<tr><td style="padding:14px 0;border-bottom:1px solid #EFEFEF"><a href="' || l || '" style="text-decoration:none"><span style="display:block;font:500 15px/20px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A">' || t || ' →</span><span style="display:block;margin-top:2px;font:400 13px/18px Geist,Arial,Helvetica,sans-serif;color:#7A7A7A">' || d || '</span></a></td></tr>', '' order by o)
        from (values (1, 'https://hentity.com', 'See this week’s launches', 'Upvote what you’d use. The board resets every Monday at 06:00 WAT.'),
                     (2, 'https://hentity.com/launch', 'Launch your product', 'Pick a launch day and get in front of early adopters across Africa.'),
                     (3, 'https://hentity.com/find', 'Find a co-founder or your next role', 'Roles and people open to work. Nobody’s name shows until you both say yes.'),
                     (4, 'https://hentity.com/insights', 'See what’s being built', 'Live numbers on startups, sectors and cities across the continent.')) v(o, l, t, d))
    || '</table>' || public.h_email_button('https://hentity.com', 'Explore this week’s launches')
    || '<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#7A7A7A">Every Monday you’ll get The Launchpad: the week’s top launches in two minutes. Reply to this email any time, a person reads it.</p>';
  perform public.h_email_send(uid, 'welcome', '', null, 'Welcome to Hentity, ' || first,
    public.h_email_layout('digest', 'Welcome to Hentity', 'Discover what’s being built across Africa', case when live > 0 then public.h_num(live) || ' startups live right now' else 'A fresh launch board every Monday' end,
      body, uid, 'You’re getting this because you just joined Hentity.', 'digest'));
end $$;

-- Welcome goes out once the address is confirmed (an account row exists as soon as someone asks for a code)
create or replace function public.trg_email_welcome() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    begin perform public.email_welcome(new.id); exception when others then raise warning 'welcome email failed: %', sqlerrm; end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_email_welcome on public.profiles;
drop trigger if exists auth_email_welcome on auth.users;
create trigger auth_email_welcome after insert or update of email_confirmed_at on auth.users for each row execute function public.trg_email_welcome();

-- ===================================================================== weekly digest + Product of the Week
create or replace function public.email_weekly_digest(only_uid uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare w weeks; n int; total bigint; countries int; issue int; rows_html text; msgs jsonb := '[]'::jsonb; m jsonb; u record; hi text; city_n int; sent int := 0;
  r record; rank int := 0; subj text; d text;
begin
  -- the week that just ended
  select * into w from weeks where ends_at <= now() + interval '1 hour' order by ends_at desc limit 1;
  if w.id is null then return 0; end if;
  select count(*), coalesce(sum(upvote_count), 0), count(distinct country) into n, total, countries
    from product_feed where week_id = w.id and status = 'live' and not promoted;
  if n = 0 then return 0; end if;
  select coalesce((value ->> 'n')::int, 0) + 1 into issue from site_settings where key = 'launchpad';
  issue := coalesce(issue, 1);
  select string_agg('<tr><td style="padding:12px 0;border-bottom:1px solid #EFEFEF"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>'
      || '<td width="44" valign="middle">' || public.h_email_logo(name, logo_url, color, 32) || '</td>'
      || '<td valign="middle"><a href="https://hentity.com/products/' || slug || '?ref=launchpad" style="text-decoration:none"><span style="display:block;font:500 14px/18px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A">' || public.h_esc(name) || '</span>'
      || '<span style="display:block;font:400 13px/18px Geist,Arial,Helvetica,sans-serif;color:#8A8A8A">' || public.h_esc(tagline) || '</span></a></td>'
      || '<td width="70" align="right" valign="middle"><span style="display:inline-block;padding:6px 10px;border:1px solid #E5E5E5;border-radius:8px;font:500 13px/16px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A;white-space:nowrap">▲ ' || public.h_num(upvote_count) || '</span></td>'
      || '</tr></table></td></tr>', '' order by upvote_count desc, name)
    into rows_html from (select * from product_feed where week_id = w.id and status = 'live' and not promoted order by upvote_count desc, name limit 3) t;
  d := to_char(now() at time zone 'Africa/Lagos', 'FMDD FMMonth YYYY');
  for u in select p.id, p.name, p.city from profiles p where not p.is_seed and coalesce(p.email, '') ~ '@' and (only_uid is null or p.id = only_uid) loop
    hi := split_part(coalesce(nullif(u.name, ''), 'there'), ' ', 1);
    city_n := case when coalesce(u.city, '') <> '' then (select count(*) from product_feed where week_id = w.id and status = 'live' and lower(city) = lower(u.city)) else 0 end;
    m := public.h_email_msg(u.id, 'digest', w.id::text, 'digest', 'This week in African startups: ' || (select name from product_feed where week_id = w.id and status = 'live' and not promoted order by upvote_count desc, name limit 1) || ' is #1',
      public.h_email_layout('digest', 'The Launchpad · No. ' || issue, 'This week in African startups', d || ' · 2 min read',
        '<p style="margin:0 0 24px">Hi ' || public.h_esc(hi) || ', ' || public.h_num(n) || ' startup' || case when n = 1 then '' else 's' end || ' launched on Hentity last week'
          || case when city_n > 0 then ', ' || city_n || ' in ' || public.h_esc(u.city) else '' end || '. Here are the ones people loved most.</p>'
          || '<h2 style="margin:0 0 6px;font:600 20px/26px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A;letter-spacing:-0.01em">Top launches</h2>'
          || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">' || rows_html || '</table>'
          || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td bgcolor="#F1EFFF" style="background:#F1EFFF;border-radius:12px;padding:20px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
          || '<td valign="middle" style="padding-right:16px;font:600 32px/36px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A;letter-spacing:-0.02em;white-space:nowrap">' || public.h_num(total) || '</td>'
          || '<td valign="middle"><span style="display:block;font:400 11px/16px ''Geist Mono'',Menlo,Consolas,monospace;letter-spacing:.08em;color:#6D4AFF">NUMBER OF THE WEEK</span><span style="display:block;font:400 13px/18px Geist,Arial,Helvetica,sans-serif;color:#3D3D3D">Upvotes on last week’s launches, from founders and users in ' || countries || ' countr' || case when countries = 1 then 'y' else 'ies' end || '.</span></td>'
          || '</tr></table></td></tr></table>'
          || public.h_email_button('https://hentity.com/?ref=launchpad', 'See all ' || public.h_num(n) || ' launches'),
        u.id, 'You’re getting this because you have a Hentity account and the weekly digest is on.', 'digest', null, null, 'https://hentity.com'),
      'Hentity', 'launchpad');
    if m is not null then msgs := msgs || jsonb_build_array(m); sent := sent + 1; end if;
  end loop;
  -- Product of the Week: the top three makers hear first
  if only_uid is null then
    for r in select * from product_feed where week_id = w.id and status = 'live' and not promoted and owner_id is not null order by upvote_count desc, name limit 3 loop
      rank := rank + 1;
      subj := r.name || ' is #' || rank || ' Product of the Week on Hentity';
      m := public.h_email_msg(r.owner_id, 'potw', w.id::text || ':' || r.id, 'featured', subj,
        public.h_email_layout('launch', null, r.name || ' is #' || rank || ' on Hentity this week', public.h_num(r.upvote_count) || ' upvotes. The medal stays on your product page for good.',
          '<p style="margin:0 0 20px">Congratulations. ' || public.h_esc(r.name) || ' finished #' || rank || ' of ' || n || ' launches in week ' || w.id || '. Add the badge to your site so visitors can see it, and share the win with the people who backed you.</p>'
            || public.h_email_button('https://hentity.com/launch-recap?p=' || r.slug, 'Get your badge'),
          r.owner_id, 'You’re getting this because your product launched on Hentity.', 'featured',
          '<table role="presentation" width="150" height="150" cellpadding="0" cellspacing="0" border="0" background="https://hentity.com/email/art-launch.png" style="background:url(https://hentity.com/email/art-launch.png) center/150px 150px no-repeat"><tr><td align="center" valign="middle" height="150">' || public.h_email_logo(r.name, r.logo_url, r.color, 64) || '</td></tr></table>',
          '★ #' || rank || ' Product of the Week', 'https://hentity.com/products/' || r.slug));
      if m is not null then msgs := msgs || jsonb_build_array(m); end if;
    end loop;
    insert into site_settings (key, value) values ('launchpad', jsonb_build_object('n', issue, 'week', w.id, 'sent_at', now()))
      on conflict (key) do update set value = excluded.value;
  end if;
  perform public.h_resend(msgs);
  return sent;
end $$;

-- ===================================================================== launch day
create or replace function public.email_launch_day() returns int
language plpgsql security definer set search_path = public as $$
declare r record; msgs jsonb := '[]'::jsonb; m jsonb;
begin
  for r in select * from products where launch_date = public.lagos_today() and status in ('scheduled', 'live') and owner_id is not null loop
    m := public.h_email_msg(r.owner_id, 'launch_day', r.id::text || ':' || r.launch_date, 'scheduled', r.name || ' is live on Hentity today',
      public.h_email_layout('launch', null, r.name || ' is live on Hentity today', 'Upvotes are open until the board resets on Monday at 06:00 WAT.',
        '<p style="margin:0 0 16px">Today’s the day. The people who asked to be reminded about ' || public.h_esc(r.name) || ' got a heads-up this morning. What helps most:</p>'
          || '<p style="margin:0 0 8px">1. Post your launch link on WhatsApp, X and LinkedIn. Ask for feedback, not upvotes.</p>'
          || '<p style="margin:0 0 8px">2. Reply to every comment today. Makers who answer quickly rise faster.</p>'
          || '<p style="margin:0 0 24px">3. Pin your maker intro so new visitors know why you built it.</p>'
          || public.h_email_button('https://hentity.com/launch-week?p=' || r.slug, 'Open your launch'),
        r.owner_id, 'You’re getting this because your product launches on Hentity today.', 'scheduled',
        '<table role="presentation" width="150" height="150" cellpadding="0" cellspacing="0" border="0" background="https://hentity.com/email/art-launch.png" style="background:url(https://hentity.com/email/art-launch.png) center/150px 150px no-repeat"><tr><td align="center" valign="middle" height="150">' || public.h_email_logo(r.name, r.logo_url, r.color, 64) || '</td></tr></table>',
        'Live today', 'https://hentity.com/products/' || r.slug));
    if m is not null then msgs := msgs || jsonb_build_array(m); end if;
  end loop;
  perform public.h_resend(msgs);
  return jsonb_array_length(msgs);
end $$;

-- ===================================================================== monthly insights
create or replace function public.email_monthly_insights(only_uid uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare live int; launched int; mon text; cats text; lead text; grow text; msgs jsonb := '[]'::jsonb; m jsonb; u record; mx int;
  m0 date := (date_trunc('month', public.lagos_today()) - interval '1 month')::date; m1 date := date_trunc('month', public.lagos_today())::date;   -- last full month
begin
  select count(*) into live from product_feed where effective_status = 'live';
  if live = 0 then return 0; end if;
  select count(*) into launched from products where status = 'live' and launch_date >= m0 and launch_date < m1;
  mon := to_char(m0, 'FMMonth YYYY');
  select max(n) into mx from (select count(*) n from product_feed, unnest(categories) c where effective_status = 'live' group by c) t;
  select string_agg('<tr><td width="120" style="padding:6px 12px 6px 0;font:400 13px/18px Geist,Arial,Helvetica,sans-serif;color:#3D3D3D;white-space:nowrap">' || public.h_esc(c) || '</td><td style="padding:6px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="' || greatest(6, (n * 100 / mx))::int || '%"><tr><td height="10" bgcolor="' || col || '" style="background:' || col || ';border-radius:5px;font-size:0;line-height:0">&nbsp;</td></tr></table></td><td width="40" align="right" style="padding:6px 0 6px 8px;font:500 13px/18px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A">' || n || '</td></tr>', '' order by n desc),
         min(c) filter (where rk = 1)
    into cats, lead
    from (select c, count(*) n, row_number() over (order by count(*) desc, c) rk, (array['#5CB2FF','#FF8F57','#2FE0A5','#A393FF','#FF85C0'])[least(5, row_number() over (order by count(*) desc, c))::int] col
          from product_feed, unnest(categories) c where effective_status = 'live' group by c order by n desc, c limit 5) t;
  select c into grow from (select c, count(*) n from products, unnest(categories) c where status = 'live' and launch_date >= m0 and launch_date < m1 group by c order by n desc, c limit 1) t;
  for u in select p.id, p.name from profiles p where not p.is_seed and coalesce(p.email, '') ~ '@' and (only_uid is null or p.id = only_uid) loop
    m := public.h_email_msg(u.id, 'insights', mon, 'insights', public.h_num(live) || ' startups are live on Hentity · ' || mon,
      public.h_email_layout('insights', 'Insights · ' || mon, public.h_num(live) || ' startups are live on Hentity',
        coalesce(lead || ' leads' || case when grow is not null and grow <> lead then '; ' || grow || ' launched the most last month.' else '.' end, ''),
        '<p style="margin:0 0 20px">Hi ' || public.h_esc(split_part(coalesce(nullif(u.name, ''), 'there'), ' ', 1)) || ', here’s what’s being built across Africa.' || case when launched > 0 then ' ' || public.h_num(launched) || ' startup' || case when launched = 1 then '' else 's' end || ' launched on Hentity in ' || mon || '.' else '' end || '</p>'
          || case when cats is null then '' else '<h2 style="margin:0 0 8px;font:600 20px/26px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A">Top sectors</h2>'
          || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">' || cats || '</table>' end
          || public.h_email_button('https://hentity.com/insights?ref=email', 'Explore Insights'),
        u.id, 'You’re getting this because you have a Hentity account and monthly Insights are on.', 'insights', null, null, 'https://hentity.com/insights'),
      'Hentity Insights', 'insights');
    if m is not null then msgs := msgs || jsonb_build_array(m); end if;
  end loop;
  perform public.h_resend(msgs);
  return jsonb_array_length(msgs);
end $$;

-- ===================================================================== Find
-- find_note already runs for every Find event; it now emails too (except chat messages, which stay in-app)
create or replace function public.find_note(uid uuid, t text, b text, lnk text) returns void
language plpgsql security definer set search_path = public as $$
declare eb text;
begin
  insert into notifications (user_id, type, grp, title, body, link, action_label) values (uid, 'find', 'system', t, b, lnk, 'Open');
  if t like 'New message%' then return; end if;
  eb := case when t like 'It''s a match%' or t like 'NDA signed%' then 'Find · New match' when t like 'New application%' then 'Find · New application'
             when t like 'Your role%' then 'Find · Your role' when t like 'You''re invited%' then 'Find · Invite' else 'Find' end;
  perform public.h_email_send(uid, 'find', md5(t || coalesce(lnk, '') || public.lagos_today()::text), 'find', t,
    public.h_email_layout('find', eb, t, b, '<p style="margin:0 0 24px">Open Find to see the details and answer. Names and contact details only show once you both say yes.</p>'
      || public.h_email_button('https://hentity.com' || coalesce(lnk, '/find'), 'Open in Find'),
      uid, 'You’re getting this because you use Find on Hentity.', 'find', null, null, 'https://hentity.com' || coalesce(lnk, '/find')),
    'Hentity Find', 'find');
end $$;
revoke execute on function public.find_note(uuid, text, text, text) from public, anon, authenticated;

-- ===================================================================== unsubscribe (link in every email; no sign-in needed)
create or replace function public.email_unsubscribe(u uuid, t text, k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare keys text[] := array['review','scheduled','milestones','comments','featured','replies','followers','following','digest','insights','find']; s jsonb; x text;
begin
  if t is null or t <> public.h_unsub_token(u) then raise exception 'This unsubscribe link isn’t valid' using errcode = 'P0001'; end if;
  if k <> 'all' and not k = any(keys) then raise exception 'Unknown email type' using errcode = 'P0001'; end if;
  select coalesce(settings, '{}'::jsonb) into s from profiles where id = u;
  if s is null then raise exception 'Account not found' using errcode = 'P0001'; end if;
  foreach x in array case when k = 'all' then keys else array[k] end loop
    s := jsonb_set(s, '{notif}', coalesce(s -> 'notif', '{}'::jsonb) || jsonb_build_object(x || '.1', false), true);
  end loop;
  update profiles set settings = s where id = u;
  return jsonb_build_object('ok', true, 'kind', k);
end $$;
grant execute on function public.email_unsubscribe(uuid, text, text) to anon, authenticated;

-- Admin: send yourself every template to check them
create or replace function public.email_preview_all() returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p record; n int := 0;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  delete from email_log where user_id = me and kind in ('welcome','digest','insights','potw','launch_day','find') and created_at > now() - interval '1 day';
  perform public.email_welcome(me); n := n + 1;
  n := n + public.email_weekly_digest(me);
  n := n + public.email_monthly_insights(me);
  select * into p from product_feed where effective_status = 'live' order by upvote_count desc limit 1;
  if p.id is not null then
    perform public.h_email_send(me, 'potw', 'preview:' || now(), null, 'Preview: ' || p.name || ' is #1 Product of the Week on Hentity',
      public.h_email_layout('launch', null, p.name || ' is #1 on Hentity this week', public.h_num(p.upvote_count) || ' upvotes. The medal stays on your product page for good.',
        '<p style="margin:0 0 20px">This is how the Product of the Week email looks for the top three makers.</p>' || public.h_email_button('https://hentity.com/launch-recap?p=' || p.slug, 'Get your badge'),
        me, 'Preview sent from Admin.', null,
        '<table role="presentation" width="150" height="150" cellpadding="0" cellspacing="0" border="0" background="https://hentity.com/email/art-launch.png" style="background:url(https://hentity.com/email/art-launch.png) center/150px 150px no-repeat"><tr><td align="center" valign="middle" height="150">' || public.h_email_logo(p.name, p.logo_url, p.color, 64) || '</td></tr></table>',
        '★ #1 Product of the Week', 'https://hentity.com/products/' || p.slug));
    n := n + 1;
  end if;
  perform public.h_email_send(me, 'find', 'preview:' || now(), null, 'Preview: New application for Growth lead',
    public.h_email_layout('find', 'Find · New application', 'New application for Growth lead', 'CV and LinkedIn attached', '<p style="margin:0 0 24px">This is how Find emails look.</p>' || public.h_email_button('https://hentity.com/find/matches', 'Open in Find'), me, 'Preview sent from Admin.', null), 'Hentity Find', 'find');
  return n + 1;
end $$;

create or replace function public.admin_email_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) from (select kind, count(*) n from email_log where created_at > now() - interval '30 days' group by kind) t),
    'recent', (select coalesce(jsonb_agg(x order by x ->> 'created_at' desc), '[]'::jsonb) from (select jsonb_build_object('kind', kind, 'to', to_addr, 'subject', subject, 'created_at', created_at) x from email_log order by created_at desc limit 50) t),
    'audience', (select count(*) from profiles where not is_seed and coalesce(email, '') ~ '@'),
    'digest_on', (select count(*) from profiles where not is_seed and coalesce(email, '') ~ '@' and coalesce((settings -> 'notif' ->> 'digest.1')::boolean, true)),
    'launchpad', (select value from site_settings where key = 'launchpad'));
end $$;

grant execute on function public.email_preview_all(), public.admin_email_stats() to authenticated;
revoke execute on function public.email_welcome(uuid), public.email_weekly_digest(uuid), public.email_launch_day(), public.email_monthly_insights(uuid),
  public.h_email_send(uuid, text, text, text, text, text, text, text), public.h_email_msg(uuid, text, text, text, text, text, text, text), public.h_resend(jsonb),
  public.h_email_layout(text, text, text, text, text, uuid, text, text, text, text, text), public.h_unsub_token(uuid), public.h_unsub_url(uuid, text), public.h_email_ok(uuid, text),
  public.h_send_email(text, text, text, text) from public, anon, authenticated;

-- ===================================================================== schedule (times in UTC; WAT = UTC+1)
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('hentity-launchpad', 'hentity-launch-day', 'hentity-insights');
  perform cron.schedule('hentity-launchpad', '0 6 * * 1', 'select public.email_weekly_digest()');      -- Mondays 07:00 WAT
  perform cron.schedule('hentity-launch-day', '5 5 * * *', 'select public.email_launch_day()');        -- daily 06:05 WAT
  perform cron.schedule('hentity-insights', '0 8 1 * *', 'select public.email_monthly_insights()');    -- 1st of the month 09:00 WAT
end $$;
