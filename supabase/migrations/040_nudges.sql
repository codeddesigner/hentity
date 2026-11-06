-- Admin → Emails → "Finish your profile" nudges. The admin ticks which gaps to chase (profile photo, bio,
-- product logo, CAC number, an unfinished submission...), sees who's missing them, and sends each person one
-- email listing only their own gaps with a link to fix each. People can turn these off ("tips") and get at most
-- one nudge every 3 days.

-- Every gap we can detect for one member: profile items, then items per product they own
create or replace function public.nudge_gaps(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with u as (select * from profiles where id = uid),
  pg as (
    select k, l, 'https://hentity.com/settings/profile' link from u, lateral (values
      ('photo', 'Add a profile photo', coalesce(u.avatar_url, '') = ''),
      ('headline', 'Add a one-line headline', coalesce(trim(u.headline), '') = ''),
      ('bio', 'Write a short bio', char_length(coalesce(trim(u.bio), '')) < 30),
      ('location', 'Add your city', coalesce(trim(u.city), '') = ''),
      ('links', 'Link your LinkedIn, X or website', coalesce(u.linkedin, '') = '' and coalesce(u.x, '') = '' and coalesce(u.website, '') = '')) v(k, l, miss)
    where miss),
  prods as (
    select p.*, case when p.status in ('live', 'scheduled') and not (p.status = 'live' and p.claimed_at is not null and p.week_id is null and p.launch_date is null)
      then 'https://hentity.com/products/' || p.slug || '/edit' when p.status = 'changes' then 'https://hentity.com/changes-requested?p=' || p.slug
      else 'https://hentity.com/submit?id=' || p.id end link
    from products p where p.owner_id = uid and p.status in ('draft', 'changes', 'scheduled', 'live')),
  pp as (
    select p.id, p.name, p.slug, p.status, p.link, k, l from prods p, lateral (values
      ('p_draft', 'Finish and submit it for review', p.status = 'draft' and p.created_at < now() - interval '1 day'),
      ('p_changes', 'Make the requested changes and resubmit', p.status = 'changes'),
      ('p_logo', 'Upload a logo', coalesce(p.logo_url, '') = ''),
      ('p_media', 'Add screenshots', coalesce(jsonb_array_length(p.media), 0) = 0),
      ('p_desc', 'Write a description', char_length(coalesce(trim(p.description), '')) < 80),
      ('p_website', 'Add your website', coalesce(trim(p.website), '') = ''),
      ('p_cac', 'Add your CAC / registration number to get Verified', not p.verified and coalesce(p.verify ->> 'company', '') = ''
         and not exists (select 1 from companies c where c.id = p.company_id and coalesce(c.registration, '') <> '')),
      ('p_founder', 'Add your founder LinkedIn or X', coalesce(p.verify ->> 'founder', '') = '')) v(k, l, miss)
    where miss)
  select jsonb_build_object(
    'profile', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'l', l, 'link', link)) from pg), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status, 'link', link, 'items', items)) from (
        select id, name, status, link, jsonb_agg(jsonb_build_object('k', k, 'l', l) order by k) items from pp group by id, name, status, link) x), '[]'::jsonb));
$$;
revoke execute on function public.nudge_gaps(uuid) from public, anon, authenticated;

-- Members who'd get a nudge for the chosen gaps, with what they're missing
create or replace function public.admin_nudge_audience(kinds text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return (select jsonb_build_object(
      'counts', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
          select k, count(distinct uid) n from (
            select p.id uid, g.k from profiles p, jsonb_to_recordset(public.nudge_gaps(p.id) -> 'profile') g(k text)
              where not p.is_seed and coalesce(p.email, '') ~ '@' and not p.banned
            union all
            select p.id, i.k from profiles p, jsonb_array_elements(public.nudge_gaps(p.id) -> 'products') pr, jsonb_to_recordset(pr -> 'items') i(k text)
              where not p.is_seed and coalesce(p.email, '') ~ '@' and not p.banned) t group by k) c),
      'people', (select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) from (
          select jsonb_build_object('id', p.id, 'name', p.name, 'email', p.email, 'tips_off', not public.h_email_ok(p.id, 'tips'),
            'last', (select max(created_at) from email_log l where l.user_id = p.id and l.kind = 'nudge'),
            'missing', (select coalesce(jsonb_agg(distinct m), '[]'::jsonb) from (
                select g.k m from jsonb_to_recordset(public.nudge_gaps(p.id) -> 'profile') g(k text)
                union all select i.k from jsonb_array_elements(public.nudge_gaps(p.id) -> 'products') pr, jsonb_to_recordset(pr -> 'items') i(k text)) s where m = any(kinds))) x
          from profiles p where not p.is_seed and coalesce(p.email, '') ~ '@' and not p.banned) t
        where jsonb_array_length(x -> 'missing') > 0)));
end $$;

-- The email for one member, limited to the chosen gaps. Null when they have none of them.
create or replace function public.nudge_email_html(uid uuid, kinds text[], note text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g jsonb; u profiles; prof text; prods text; first_link text; n int; row_tpl text; subj text; pr jsonb;
begin
  select * into u from profiles where id = uid;
  g := public.nudge_gaps(uid);
  row_tpl := '<tr><td style="padding:12px 0;border-bottom:1px solid #EFEFEF"><a href="%s" style="text-decoration:none;font:500 15px/20px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A">%s <span style="color:#FF5A1F">→</span></a></td></tr>';
  select string_agg(format(row_tpl, public.h_esc(x ->> 'link'), public.h_esc(x ->> 'l')), ''), min(x ->> 'link'), count(*)
    into prof, first_link, n from jsonb_array_elements(g -> 'profile') x where x ->> 'k' = any(kinds);
  prods := '';
  for pr in select * from jsonb_array_elements(g -> 'products') loop
    if exists (select 1 from jsonb_array_elements(pr -> 'items') i where i ->> 'k' = any(kinds)) then
      prods := prods || '<h2 style="margin:24px 0 4px;font:600 18px/24px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A">' || public.h_esc(pr ->> 'name') || '</h2>'
        || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
        || (select string_agg(format(row_tpl, public.h_esc(pr ->> 'link'), public.h_esc(i ->> 'l')), '') from jsonb_array_elements(pr -> 'items') i where i ->> 'k' = any(kinds)) || '</table>';
      first_link := coalesce(first_link, pr ->> 'link');
      n := coalesce(n, 0) + (select count(*) from jsonb_array_elements(pr -> 'items') i where i ->> 'k' = any(kinds));
    end if;
  end loop;
  if coalesce(n, 0) = 0 then return null; end if;
  subj := case when prods <> '' and prof is null then 'A few things to finish on ' || (select pr2 ->> 'name' from jsonb_array_elements(g -> 'products') pr2 where exists (select 1 from jsonb_array_elements(pr2 -> 'items') i where i ->> 'k' = any(kinds)) limit 1)
               else 'A few things to finish on your Hentity profile' end;
  return jsonb_build_object('subject', subj, 'html', public.h_email_layout('digest', 'Your Hentity page', case when prods <> '' then 'A few things to finish' else 'Finish your profile' end,
    n || ' quick fix' || case when n = 1 then '' else 'es' end || '. Complete pages get more follows and upvotes.',
    '<p style="margin:0 0 16px">Hi ' || public.h_esc(split_part(coalesce(nullif(u.name, ''), 'there'), ' ', 1)) || ',</p>'
      || case when coalesce(trim(note), '') <> '' then '<p style="margin:0 0 16px;white-space:pre-line">' || public.h_esc(trim(note)) || '</p>' else '<p style="margin:0 0 16px">People decide in seconds whether to click, follow or upvote. These are the gaps on your Hentity page right now:</p>' end
      || case when prof is not null then '<h2 style="margin:8px 0 4px;font:600 18px/24px Geist,Arial,Helvetica,sans-serif;color:#0A0A0A">Your profile</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' || prof || '</table>' else '' end
      || prods
      || '<div style="height:24px"></div>' || public.h_email_button(first_link, 'Start with the first one')
      || '<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#7A7A7A">Each takes about a minute. Changes to a live product go to our team for a quick check before they show.</p>',
    uid, 'You’re getting this because parts of your Hentity page are incomplete.', 'tips', null, null, coalesce(first_link, 'https://hentity.com')));
end $$;
revoke execute on function public.nudge_email_html(uuid, text[], text) from public, anon, authenticated;

-- Send (or preview to yourself). Skips anyone nudged in the last 3 days or who turned tips off.
create or replace function public.admin_send_nudges(kinds text[], note text default null, test_only boolean default false, only_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p record; e jsonb; m jsonb; msgs jsonb := '[]'::jsonb; skipped int := 0;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if coalesce(cardinality(kinds), 0) = 0 then raise exception 'Pick at least one thing to chase' using errcode = 'P0001'; end if;
  if test_only then
    -- a sample built from the first person who matches, sent to you
    for p in select x ->> 'id' id from jsonb_array_elements(public.admin_nudge_audience(kinds) -> 'people') x limit 1 loop
      e := public.nudge_email_html((p.id)::uuid, kinds, note);
    end loop;
    if e is null then raise exception 'Nobody is missing those right now' using errcode = 'P0001'; end if;
    perform public.h_resend(jsonb_build_object('from', 'Hentity <hello@hentity.com>', 'to', jsonb_build_array((select email from profiles where id = auth.uid())),
      'subject', 'Test: ' || (e ->> 'subject'), 'html', e ->> 'html', 'reply_to', 'hello@hentity.com'));
    return jsonb_build_object('sent', 1, 'test', true);
  end if;
  for p in select id from profiles where not is_seed and coalesce(email, '') ~ '@' and not banned and (only_ids is null or id = any(only_ids)) loop
    if exists (select 1 from email_log where user_id = p.id and kind = 'nudge' and created_at > now() - interval '3 days') then skipped := skipped + 1; continue; end if;
    e := public.nudge_email_html(p.id, kinds, note);
    if e is null then continue; end if;
    m := public.h_email_msg(p.id, 'nudge', to_char(now(), 'YYYY-MM-DD HH24:MI') || ':' || array_to_string(kinds, ','), 'tips', e ->> 'subject', e ->> 'html');
    if m is null then skipped := skipped + 1; continue; end if;
    msgs := msgs || jsonb_build_array(m);
  end loop;
  perform public.h_resend(msgs);
  perform public.audit('email.nudge', 'email', null, jsonb_build_object('kinds', kinds, 'sent', jsonb_array_length(msgs), 'skipped', skipped));
  return jsonb_build_object('sent', jsonb_array_length(msgs), 'skipped', skipped);
end $$;

grant execute on function public.admin_nudge_audience(text[]), public.admin_send_nudges(text[], text, boolean, uuid[]) to authenticated;
revoke execute on function public.admin_nudge_audience(text[]), public.admin_send_nudges(text[], text, boolean, uuid[]) from anon;

-- "tips" can be turned off from the unsubscribe link and notification settings
create or replace function public.email_unsubscribe(u uuid, t text, k text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare keys text[] := array['review','scheduled','milestones','comments','featured','replies','followers','following','digest','insights','find','tips']; s jsonb; x text;
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
