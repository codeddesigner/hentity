-- Mini-admins get the same powers as admins, except: they can't change anyone's role (so they can't add
-- admins or mini-admins), and can't edit, ban or delete a full admin or another mini-admin's account.
create or replace function public.admin_broadcast(ttl text, bdy text, lnk text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  insert into notifications(user_id, type, grp, title, body, link, actor_id)
    select id, 'system', 'system', ttl, bdy, lnk, auth.uid() from profiles where not is_seed and not banned;
  get diagnostics n = row_count;
  perform audit('notifications.broadcast', 'all', null, jsonb_build_object('title', ttl, 'count', n));
  return n;
end $$;

drop policy if exists "admin profile delete" on profiles;
create policy "admin profile delete" on profiles for delete using (is_full_admin() or (is_admin() and role not in ('admin','moderator')));
drop policy if exists "settings admin" on site_settings;
create policy "settings admin" on site_settings for all using (is_admin()) with check (is_admin());
drop policy if exists "newsletter admin" on newsletter;
create policy "newsletter admin" on newsletter for select using (is_admin());
drop policy if exists "newsletter admin delete" on newsletter;
create policy "newsletter admin delete" on newsletter for delete using (is_admin());
drop policy if exists "audit admin" on audit_log;
create policy "audit admin" on audit_log for select using (is_admin());
drop policy if exists "email log admin" on public.email_log;
create policy "email log admin" on public.email_log for select using (public.is_admin());

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
