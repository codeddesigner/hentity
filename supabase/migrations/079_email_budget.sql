-- Keep room for sign-in codes. Resend's plan has a daily cap shared by Supabase Auth (codes) and our own
-- emails. Emails people can opt out of (digests, nudges, announcements: anything with a pref) stop for the
-- rest of the UTC day once we've sent `bulk_cap` of our own. Codes, receipts and welcomes still go.
-- site_settings 'email_budget': {"bulk_cap": 60}. Set bulk_cap to null for no cap (e.g. on a paid plan).

insert into public.site_settings (key, value) values ('email_budget', '{"bulk_cap": 60}'::jsonb)
on conflict (key) do nothing;

create or replace function public.h_email_budget_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'bulk_cap')::int from site_settings where key = 'email_budget'), null) is null
      or (select count(*) from email_log where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')
         < (select (value ->> 'bulk_cap')::int from site_settings where key = 'email_budget');
$$;
revoke execute on function public.h_email_budget_ok() from public, anon, authenticated;

create or replace function public.h_email_msg(uid uuid, kind text, ref text, pref text, subj text, html text, from_name text default 'Hentity', from_local text default 'hello')
returns jsonb language plpgsql security definer set search_path = public as $$
declare em text; ins int;
begin
  if not public.h_email_ok(uid, pref) then return null; end if;
  if pref is not null and not public.h_email_budget_ok() then return null; end if;   -- over today's bulk budget
  select email into em from profiles where id = uid;
  insert into email_log (user_id, kind, ref, to_addr, subject) values (uid, kind, coalesce(ref, ''), em, subj) on conflict do nothing;
  get diagnostics ins = row_count;
  if ins = 0 then return null; end if;
  return jsonb_build_object('from', from_name || ' <' || from_local || '@hentity.com>', 'to', jsonb_build_array(em), 'subject', subj, 'html', html,
    'reply_to', 'hello@hentity.com',
    'headers', case when pref is not null then jsonb_build_object('List-Unsubscribe', '<' || public.h_unsub_url(uid, pref) || '>') else '{}'::jsonb end);
end $$;
