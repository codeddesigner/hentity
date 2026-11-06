-- Email every admin and moderator the moment a product is submitted for review (reviews promise ~1 hour).
-- Sends through Resend's API with pg_net. The send-only key lives in Vault as 'resend_review_alerts'
-- (created outside this file so it never sits in git):
--   select vault.create_secret('<key>', 'resend_review_alerts', 'Send-only Resend key for review alert emails');
create extension if not exists pg_net with schema extensions;

create or replace function public.h_esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function public.notify_admins_of_submission() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text; tos text[]; owner_name text; owner_email text; reg text; html text; resubmit boolean;
begin
  if new.status <> 'review' or (tg_op = 'UPDATE' and old.status = 'review') then return new; end if;
  begin
    select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_review_alerts' limit 1;
    select array_agg(email) into tos from profiles where role in ('admin', 'moderator') and coalesce(email, '') <> '' and not banned;
    if k is null or tos is null then return new; end if;
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
      || '<tr><td style="color:#777;padding:3px 16px 3px 0">Registration</td><td>' || case when reg is null then 'Not provided' else h_esc(reg) || ' (can be verified)' end || '</td></tr>'
      || '</table>'
      || '<p style="margin:24px 0"><a href="https://hentity.com/admin#review/' || new.id || '" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open the review</a></p>'
      || '<p style="color:#999;font-size:12px">You get this because you are a Hentity admin or moderator.</p></div>';
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'Hentity Reviews <noreply@hentity.com>',
        'to', to_jsonb(tos),
        'subject', (case when resubmit then 'Resubmitted: ' else 'Review needed: ' end) || new.name,
        'html', html,
        'tags', jsonb_build_array(jsonb_build_object('name', 'type', 'value', 'review_alert'))));
  exception when others then
    raise warning 'review alert email failed: %', sqlerrm;   -- never block a submission because of email
  end;
  return new;
end $$;

revoke execute on function public.notify_admins_of_submission() from public, anon, authenticated;
drop trigger if exists products_review_alert on public.products;
create trigger products_review_alert after insert or update of status on public.products
  for each row execute function public.notify_admins_of_submission();
