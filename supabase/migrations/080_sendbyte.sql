-- All Hentity emails go through Sendbyte (api.sendbyte.africa) once its key is in Vault as 'sendbyte_api_key'.
-- Sendbyte has no batch endpoint and allows 120 requests a minute per key, so every message goes into an
-- outbox and is sent at most 90 a minute (the rest of the minute is left for sign-in codes, which use the
-- same key over SMTP). Failed sends (429 / 5xx) are retried up to 5 times; an idempotency key stops duplicates.
-- Without the Vault key, h_resend keeps using Resend exactly as before.

create table if not exists public.email_outbox (
  id bigserial primary key,
  msg jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  req_id bigint,
  tries int not null default 0,
  status int,
  error text
);
alter table public.email_outbox enable row level security;   -- functions only
create index if not exists email_outbox_pending on public.email_outbox (id) where sent_at is null;
create index if not exists email_outbox_sent on public.email_outbox (sent_at) where sent_at is not null;

-- Resend-shaped message → Sendbyte-shaped message
create or replace function public.h_sendbyte_msg(m jsonb) returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'from', m -> 'from', 'to', m -> 'to', 'subject', m -> 'subject', 'html', m -> 'html', 'text', m -> 'text',
    'cc', m -> 'cc', 'bcc', m -> 'bcc', 'reply_to', m -> 'reply_to',
    'headers', case when m -> 'headers' = '{}'::jsonb then null else m -> 'headers' end));
$$;

-- Send what the rate allows. Called right after anything is queued, and every minute by cron.
create or replace function public.h_outbox_flush(n int default 90) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare k text; room int; r record; sent int := 0;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'sendbyte_api_key' limit 1;
  if k is null then return 0; end if;
  -- sends that failed: put them back in the queue (Sendbyte's idempotency key makes a retry safe)
  update email_outbox o set sent_at = null, tries = o.tries + 1, status = x.status_code, error = left(coalesce(x.error_msg, x.content::text), 300)
  from net._http_response x
  where x.id = o.req_id and o.sent_at is not null and o.sent_at > now() - interval '6 hours'
    and (x.status_code is null or x.status_code = 429 or x.status_code >= 500) and o.tries < 5;
  update email_outbox o set status = x.status_code, error = case when x.status_code >= 300 then left(x.content::text, 300) end
  from net._http_response x where x.id = o.req_id and o.status is null;
  room := least(n, 90 - (select count(*) from email_outbox where sent_at > now() - interval '1 minute'))::int;
  if room <= 0 then return 0; end if;
  for r in select id, msg from email_outbox where sent_at is null and tries < 5 order by id limit room for update skip locked loop
    update email_outbox set sent_at = now(), status = null, error = null,
      req_id = net.http_post(url := 'https://api.sendbyte.africa/v1/emails',
        headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
        body := r.msg || jsonb_build_object('idempotency_key', 'hentity-' || r.id), timeout_milliseconds := 15000)
    where id = r.id;
    sent := sent + 1;
  end loop;
  return sent;
end $$;

-- The one gateway every email uses: one message (object) or many (array)
create or replace function public.h_resend(msgs jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k text; sb text; i int := 0; n int;
begin
  if msgs is null then return; end if;
  select decrypted_secret into sb from vault.decrypted_secrets where name = 'sendbyte_api_key' limit 1;
  if sb is not null then
    insert into email_outbox (msg)
    select public.h_sendbyte_msg(e) from jsonb_array_elements(case when jsonb_typeof(msgs) = 'array' then msgs else jsonb_build_array(msgs) end) e;
    perform public.h_outbox_flush();
    return;
  end if;
  -- fallback: Resend
  select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_review_alerts' limit 1;
  if k is null then return; end if;
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

revoke execute on function public.h_resend(jsonb), public.h_outbox_flush(int), public.h_sendbyte_msg(jsonb) from public, anon, authenticated;

-- Admin alerts used to call Resend directly; route them through the gateway too
create or replace function public.notify_admins_beta_payment() returns trigger
language plpgsql security definer set search_path = public, extensions as $function$
declare tos text[]; pname text; owner_email text; owner_name text; total int;
begin
  if new.status <> 'awaiting_payment' or (tg_op = 'UPDATE' and old.status = 'awaiting_payment') then return new; end if;
  total := new.airtime_amount * new.spots + ceil(new.airtime_amount * new.spots * public.beta_fee_pct());
  begin
    select array_agg(email) into tos from profiles where role = 'admin' and coalesce(email, '') <> '' and not banned;
    if tos is not null then
      select p.name, pr.email, pr.name into pname, owner_email, owner_name from products p left join profiles pr on pr.id = new.owner_id where p.id = new.product_id;
      perform public.h_resend(jsonb_build_object('from', 'Hentity Betas <noreply@hentity.com>', 'to', to_jsonb(tos),
          'subject', 'Payment needed: ' || pname || ' beta · ₦' || to_char(total, 'FM999,999,999'),
          'html', '<div style="font-family:Arial,sans-serif;max-width:560px"><h2 style="margin:0 0 6px">' || h_esc(new.title) || '</h2><p style="color:#555">' || h_esc(pname) || ' · ' || h_esc(coalesce(owner_name, '')) || ' · ' || h_esc(coalesce(owner_email, '')) || '</p>'
            || '<p>Airtime: ' || new.spots || ' testers × ₦' || to_char(new.airtime_amount, 'FM999,999') || ' + 5% fee = <b>₦' || to_char(total, 'FM999,999,999') || '</b></p>'
            || '<p>Send the maker payment details. When the money is in, mark it paid in Admin → Beta tests and the call goes live.</p>'
            || '<p style="margin:24px 0"><a href="https://hentity.com/admin#betas" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open Admin</a></p></div>'));
    end if;
  exception when others then raise warning 'beta payment email failed: %', sqlerrm;
  end;
  if new.owner_id is not null then
    insert into notifications (user_id, type, grp, product_id, title, body, link)
    values (new.owner_id, 'beta_payment', 'launches', new.product_id, 'Your beta call is waiting for payment', 'Hentity will email you how to pay ₦' || to_char(total, 'FM999,999,999') || '. It goes live once the money is in.', '/studio');
  end if;
  return new;
end $function$;

create or replace function public.notify_admins_of_submission() returns trigger
language plpgsql security definer set search_path = public, extensions as $function$
declare tos text[]; owner_name text; owner_email text; reg text; html text; resubmit boolean;
begin
  if new.status <> 'review' or (tg_op = 'UPDATE' and old.status = 'review') then return new; end if;
  begin
    select array_agg(email) into tos from profiles where role in ('admin', 'moderator') and coalesce(email, '') <> '' and not banned;
    if tos is null then return new; end if;
    select name, email into owner_name, owner_email from profiles where id = new.owner_id;
    reg := public.product_registration(new);
    resubmit := tg_op = 'UPDATE' and old.status = 'changes';
    html := '<div style="font-family:Arial,sans-serif;color:#111;max-width:560px">'
      || '<p style="color:#ff5b14;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 8px">' || case when resubmit then 'Resubmitted after changes' else 'New submission' end || ' · review within 1 hour</p>'
      || '<h2 style="margin:0 0 4px">' || h_esc(new.name) || '</h2>'
      || '<p style="color:#555;margin:0 0 16px">' || h_esc(new.tagline) || '</p>'
      || '<table style="font-size:14px;border-collapse:collapse">'
      || '<tr><td style="color:#777;padding:3px 16px 3px 0">Maker</td><td>' || h_esc(coalesce(owner_name, '—')) || ' · ' || h_esc(coalesce(owner_email, '')) || '</td></tr>'
      || '<tr><td style="color:#777;padding:3px 16px 3px 0">Product link</td><td>' || h_esc(coalesce(nullif(new.website, ''), '—')) || '</td></tr>'
      || '<tr><td style="color:#777;padding:3px 16px 3px 0">Founder profile</td><td>' || h_esc(coalesce(new.verify->>'founder', '—')) || '</td></tr>'
      || '<tr><td style="color:#777;padding:3px 16px 3px 0">Launch week</td><td>' || coalesce('Week ' || new.week_id, '—') || '</td></tr>'
      || '<tr><td style="color:#777;padding:3px 16px 3px 0">Registration</td><td>' || coalesce(h_esc(reg) || ' (can be verified)', 'Not provided') || '</td></tr>'
      || '</table>'
      || '<p style="margin:24px 0"><a href="https://hentity.com/admin#review/' || new.id || '" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open the review</a></p>'
      || '<p style="color:#999;font-size:12px">You get this because you are a Hentity admin or moderator.</p></div>';
    perform public.h_resend(jsonb_build_object('from', 'Hentity Reviews <noreply@hentity.com>', 'to', to_jsonb(tos),
        'subject', (case when resubmit then 'Resubmitted: ' else 'Review needed: ' end) || new.name, 'html', html,
        'tags', jsonb_build_array(jsonb_build_object('name', 'type', 'value', 'review_alert'))));
  exception when others then raise warning 'review alert email failed: %', sqlerrm;
  end;
  return new;
end $function$;

-- Drain the queue every minute
select cron.unschedule('hentity-email-outbox') where exists (select 1 from cron.job where jobname = 'hentity-email-outbox');
select cron.schedule('hentity-email-outbox', '* * * * *', $$select public.h_outbox_flush()$$);
