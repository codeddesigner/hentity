-- Funding, revised in Figma (7 Nov): Hentity doesn't take applications, pitches or intro requests.
-- Every grant and investor links to its own application page. Hentity matches, helps founders get ready
-- (copy or download what funders usually ask for), reminds them before deadlines and tracks what they
-- saved and marked as applied.

-- ---------------------------------------------------------------- catalogue
alter table public.funding_opps add column if not exists deadline_note text not null default '';   -- e.g. "23:59 WAT"

-- ---------------------------------------------------------------- tracker (saved / applied, plus reminders)
create table if not exists public.funding_track (
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  opp_id uuid not null references public.funding_opps(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'saved' check (status in ('saved','applied')),
  remind boolean not null default true,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, opp_id));
alter table public.funding_track enable row level security;
drop policy if exists "funding track own" on public.funding_track;
create policy "funding track own" on public.funding_track for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.funding_track to authenticated;

-- carry over anything saved or sent under the first version
insert into public.funding_track (user_id, opp_id, status, created_at)
select user_id, opp_id, 'saved', created_at from public.funding_saves on conflict do nothing;
insert into public.funding_track (user_id, opp_id, product_id, status, applied_at, created_at)
select user_id, opp_id, product_id, 'applied', coalesce(submitted_at, updated_at), created_at from public.funding_apps
where status in ('submitted','pitch_sent','intro_requested','shortlisted','accepted')
on conflict (user_id, opp_id) do update set status = 'applied', applied_at = excluded.applied_at, product_id = excluded.product_id;

-- the in-Hentity application flow is gone
drop function if exists public.funding_send(uuid, uuid, text, jsonb, jsonb, text, jsonb, uuid);
drop function if exists public.admin_funding_apps();
drop table if exists public.funding_apps;
drop table if exists public.funding_contacts;
drop table if exists public.funding_saves;

-- ---------------------------------------------------------------- board and detail
create or replace function public.funding_board(pid uuid, md text default 'grant') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fx jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  fx := public.funding_facts(pid);
  if fx is null then raise exception 'Pick one of your products' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'product', fx,
    'counts', (select jsonb_build_object('grant', count(*) filter (where mode = 'grant'), 'equity', count(*) filter (where mode = 'equity')) from funding_opps where active and (deadline is null or deadline >= public.lagos_today())),
    'opps', (select coalesce(jsonb_agg(x order by (x ->> 'meets')::numeric / greatest((x ->> 'total')::numeric, 1) desc, x ->> 'deadline' nulls last), '[]') from (
      select to_jsonb(o) - 'portfolio' || jsonb_build_object(
        'checks', ch, 'total', jsonb_array_length(ch), 'meets', (select count(*) from jsonb_array_elements(ch) e where (e ->> 'ok')::boolean),
        'track', (select jsonb_build_object('status', t.status, 'remind', t.remind) from funding_track t where t.opp_id = o.id and t.user_id = auth.uid())) x
      from funding_opps o, lateral (select public.funding_checks(o, fx) ch) k
      where o.active and o.mode = md and (o.deadline is null or o.deadline >= public.lagos_today())) t),
    'tracked', (select coalesce(jsonb_agg(jsonb_build_object('opp_id', o.id, 'name', o.name, 'mode', o.mode, 'status', t.status, 'deadline', o.deadline, 'round_note', o.round_note,
                  'closed', o.deadline < public.lagos_today()) order by (t.status = 'saved') desc, o.deadline nulls last, t.updated_at desc), '[]')
             from funding_track t join funding_opps o on o.id = t.opp_id where t.user_id = auth.uid() and o.mode = md));
end $$;
grant execute on function public.funding_board(uuid, text) to authenticated;

create or replace function public.funding_opp(oid uuid, pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o funding_opps; fx jsonb; ch jsonb;
begin
  select * into o from funding_opps where id = oid and (active or public.is_admin());
  if o.id is null then raise exception 'This opportunity is no longer listed' using errcode = 'P0001'; end if;
  fx := public.funding_facts(pid);
  if fx is null then raise exception 'Pick one of your products' using errcode = 'P0001'; end if;
  ch := public.funding_checks(o, fx);
  return to_jsonb(o) - 'portfolio' || jsonb_build_object('product', fx, 'checks', ch, 'total', jsonb_array_length(ch),
    'meets', (select count(*) from jsonb_array_elements(ch) e where (e ->> 'ok')::boolean),
    'track', (select jsonb_build_object('status', t.status, 'remind', t.remind, 'applied_at', t.applied_at) from funding_track t where t.opp_id = o.id and t.user_id = auth.uid()));
end $$;
grant execute on function public.funding_opp(uuid, uuid) to authenticated;

-- Admin: how many founders saved or applied (counts only, no member data)
create or replace function public.admin_funding_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then '{}'::jsonb else coalesce(jsonb_object_agg(opp_id, jsonb_build_object('saved', s, 'applied', a)), '{}') end
  from (select opp_id, count(*) filter (where status = 'saved') s, count(*) filter (where status = 'applied') a from funding_track group by opp_id) x;
$$;
grant execute on function public.admin_funding_counts() to authenticated;

-- ---------------------------------------------------------------- reminders (email + in-app)
-- Saved, not yet applied: 3 days and 1 day before the deadline. Applied: on the day results are due.
create or replace function public.email_funding_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; msgs jsonb := '[]'::jsonb; m jsonb; d int; today date := public.lagos_today(); subj text; body text;
begin
  for r in select t.user_id, t.status, o.* from funding_track t join funding_opps o on o.id = t.opp_id
           where t.remind and o.active and ((t.status = 'saved' and o.deadline - today in (3, 1)) or (t.status = 'applied' and o.decision_by = today)) loop
    d := r.deadline - today;
    if r.status = 'saved' then
      subj := r.name || ' closes ' || case when d = 1 then 'tomorrow' else 'in 3 days' end;
      body := '<p style="margin:0 0 16px">You saved <b>' || public.h_esc(r.name) || '</b> on Hentity. Applications close on ' || to_char(r.deadline, 'FMDD Mon')
        || coalesce(nullif(', ' || r.deadline_note, ', '), '') || '.</p><p style="margin:0 0 24px">Apply on ' || public.h_esc(coalesce(nullif(r.org, ''), 'their')) || '’s site, then mark it applied on Hentity so we can remind you when results are due.</p>'
        || public.h_email_button(coalesce(nullif(r.apply_url, ''), 'https://hentity.com/funding/' || r.id), 'Go to application');
    else
      subj := 'Results for ' || r.name || ' are due today';
      body := '<p style="margin:0 0 16px">' || public.h_esc(coalesce(nullif(r.org, ''), r.name)) || ' said they’d decide on <b>' || public.h_esc(r.name) || '</b> by today. Keep an eye on your inbox, including spam.</p>'
        || public.h_email_button('https://hentity.com/funding/' || r.id, 'Open on Hentity');
    end if;
    perform public.notify(r.user_id, 'system', 'system', subj, case when r.status = 'saved' then 'Apply on their site before it closes.' else 'Check your inbox for their decision.' end, '/funding/' || r.id, null, null);
    m := public.h_email_msg(r.user_id, 'funding_reminder', r.id::text || ':' || r.status || ':' || coalesce(d::text, 'results'), null, subj,
      public.h_email_layout('minimal', 'Funding', subj, null, body, r.user_id, 'You’re getting this because you turned on reminders for ' || r.name || '. Turn them off on its page on Hentity.', 'tips', null, null, 'https://hentity.com/funding/' || r.id),
      'Hentity Funding');
    if m is not null then msgs := msgs || jsonb_build_array(m); end if;
  end loop;
  perform public.h_resend(msgs);
  return jsonb_array_length(msgs);
end $$;
revoke execute on function public.email_funding_reminders() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'hentity-funding-reminders';
  perform cron.schedule('hentity-funding-reminders', '10 6 * * *', 'select public.email_funding_reminders()');   -- daily 07:10 WAT
end $$;
