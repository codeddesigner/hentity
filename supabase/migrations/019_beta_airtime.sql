-- Airtime perks for beta tests (Figma: Request testers · 5 Perk for testers).
-- Makers pay testers × airtime + 5% fee to Hentity; the call waits ("awaiting_payment") until an admin confirms the
-- money is in. Testers give a number + network when applying; only Hentity (admins) can read it. When a tester's
-- feedback arrives their airtime becomes "due"; an admin sends it and marks it sent.
alter table public.betas add column if not exists airtime_amount int not null default 0 check (airtime_amount between 0 and 100000);
alter table public.betas add column if not exists funding text not null default 'none' check (funding in ('none','awaiting','held','refunded'));
alter table public.betas add column if not exists nudged_at timestamptz;
alter table public.betas drop constraint if exists betas_status_check;
alter table public.betas add constraint betas_status_check check (status in ('draft','awaiting_payment','open','closed','cancelled'));

create or replace function public.beta_fee_pct() returns numeric language sql immutable as $$ select 0.05 $$;

-- Paid perks: makers can't publish them or change the money after it's held; admins confirm payment
create or replace function public.guard_beta_money() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or current_setting('hentity.counter', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' then
    new.funding := old.funding;
    if old.funding = 'held' and (new.airtime_amount <> old.airtime_amount or new.spots > old.spots) then
      raise exception 'The airtime budget is already paid. Contact Hentity to change it.' using errcode = 'P0001';
    end if;
  else
    new.funding := 'none';
  end if;
  if new.airtime_amount > 0 and new.funding <> 'held' and new.status = 'open' then
    new.status := 'awaiting_payment'; new.funding := 'awaiting';
  end if;
  if new.airtime_amount = 0 and new.funding = 'awaiting' then new.funding := 'none'; end if;
  return new;
end $$;
drop trigger if exists guard_beta_money on public.betas;
create trigger guard_beta_money before insert or update on public.betas for each row execute function public.guard_beta_money();

-- Private payout details (only admins can read; testers write through beta_set_payout)
create table if not exists public.beta_payouts (
  application_id uuid primary key references public.beta_applications(id) on delete cascade,
  beta_id uuid not null references public.betas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  network text not null,
  amount int not null default 0,
  status text not null default 'pending' check (status in ('pending','due','sent','cancelled')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.beta_payouts enable row level security;
drop policy if exists "payouts admin" on public.beta_payouts;
create policy "payouts admin" on public.beta_payouts for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.beta_set_payout(app uuid, phone text, network text) returns void
language plpgsql security definer set search_path = public as $$
declare a beta_applications; amt int;
begin
  select * into a from beta_applications where id = app;
  if a.user_id is distinct from auth.uid() then raise exception 'Not your application'; end if;
  if coalesce(phone, '') !~ '^\+?[0-9 ()-]{8,18}$' then raise exception 'Enter a valid phone number' using errcode = 'P0001'; end if;
  if network not in ('MTN','Airtel','Glo','9mobile','Safaricom','Vodacom','Telecel','AirtelTigo','Orange','Other') then raise exception 'Pick your network' using errcode = 'P0001'; end if;
  select airtime_amount into amt from betas where id = a.beta_id;
  insert into beta_payouts (application_id, beta_id, user_id, phone, network, amount)
  values (app, a.beta_id, a.user_id, regexp_replace(phone, '[^0-9+]', '', 'g'), network, coalesce(amt, 0))
  on conflict (application_id) do update set phone = excluded.phone, network = excluded.network
  where beta_payouts.status in ('pending','due');
end $$;

-- What the tester sees: masked number and status
create or replace function public.my_beta_payout(app uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('masked', left(phone, 7) || ' ••• ' || right(phone, 4), 'network', network, 'amount', amount, 'status', status, 'sent_at', sent_at)
  from beta_payouts where application_id = app and user_id = auth.uid();
$$;

-- Admin views and actions
create or replace function public.admin_beta_payouts() returns table (application_id uuid, beta_id uuid, beta_title text, product text, tester text, username text, phone text, network text, amount int, status text, sent_at timestamptz, feedback_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.application_id, o.beta_id, b.title, p.name, pr.name, pr.username, o.phone, o.network, o.amount, o.status, o.sent_at,
         (select f.created_at from beta_feedback f where f.application_id = o.application_id)
  from beta_payouts o join betas b on b.id = o.beta_id join products p on p.id = b.product_id join profiles pr on pr.id = o.user_id
  where public.is_admin()
  order by (o.status = 'due') desc, o.created_at desc;
$$;
create or replace function public.admin_mark_payout(app uuid, st text) returns void
language plpgsql security definer set search_path = public as $$
declare o beta_payouts; pname text;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update beta_payouts set status = st, sent_at = case when st = 'sent' then now() else sent_at end where application_id = app returning * into o;
  if st = 'sent' then
    select p.name into pname from betas b join products p on p.id = b.product_id where b.id = o.beta_id;
    insert into notifications (user_id, type, grp, title, body, link)
    values (o.user_id, 'beta_perk', 'launches', '₦' || to_char(o.amount, 'FM999,999') || ' ' || o.network || ' airtime sent', 'Thanks for testing ' || h_esc(pname) || '. Check your phone.', '/betas/' || o.beta_id);
  end if;
end $$;
create or replace function public.admin_beta_funded(b uuid, paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare bt betas;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update betas set funding = case when paid then 'held' else 'refunded' end,
                   status = case when paid then 'open' else 'cancelled' end where id = b returning * into bt;
  if paid and bt.owner_id is not null then
    insert into notifications (user_id, type, grp, product_id, title, body, link, action_label)
    values (bt.owner_id, 'beta_live', 'launches', bt.product_id, 'Payment received · your beta call is live', h_esc(bt.title), '/betas/' || bt.id || '/manage', 'Open dashboard');
  end if;
end $$;

-- Maker nudges accepted testers who haven't sent feedback (at most every 12 hours)
create or replace function public.beta_nudge(b uuid) returns int
language plpgsql security definer set search_path = public as $$
declare bt betas; pname text; n int;
begin
  if not public.owns_beta(b) then raise exception 'Only the maker can nudge testers'; end if;
  select * into bt from betas where id = b;
  if bt.nudged_at > now() - interval '12 hours' then raise exception 'You nudged testers recently. Try again later.' using errcode = 'P0001'; end if;
  select name into pname from products where id = bt.product_id;
  insert into notifications (user_id, type, grp, product_id, title, body, link, action_label)
  select a.user_id, 'beta_nudge', 'launches', bt.product_id, h_esc(pname) || ' would love your feedback', 'It takes about 5 minutes' || case when bt.perk <> '' or bt.airtime_amount > 0 then ' and unlocks your perk.' else '.' end, '/betas/' || b, 'Send feedback'
  from beta_applications a where a.beta_id = b and a.status = 'accepted' and not exists (select 1 from beta_feedback f where f.application_id = a.id);
  get diagnostics n = row_count;
  perform set_config('hentity.counter', 'on', true);
  update betas set nudged_at = now() where id = b;
  perform set_config('hentity.counter', 'off', true);
  return n;
end $$;

-- Feedback in → airtime becomes due
create or replace function public.after_beta_feedback_payout() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update beta_payouts set status = 'due' where application_id = new.application_id and status = 'pending';
  return new;
end $$;
drop trigger if exists after_beta_feedback_payout on public.beta_feedback;
create trigger after_beta_feedback_payout after insert on public.beta_feedback for each row execute function public.after_beta_feedback_payout();

-- Board stats: naira actually sent to testers
create or replace function public.beta_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', (select count(*) from betas where status = 'open' and closes_at > now()),
    'match', (select count(*) from betas b, profiles p where p.id = auth.uid() and b.status = 'open' and b.closes_at > now()
              and (cardinality(b.countries) = 0 or p.country = any(b.countries))
              and (cardinality(b.platforms) = 0 or public.platform_of(p.device_os, p.device) = any(b.platforms))),
    'testers_month', (select count(*) from beta_applications where status = 'accepted' and decided_at >= date_trunc('month', now())),
    'perks', (select count(*) from beta_applications where perk_released_at is not null),
    'paid', (select coalesce(sum(amount), 0) from beta_payouts where status = 'sent')
  );
$$;

-- Email admins when a paid beta is waiting for payment (same Resend key as review alerts)
create or replace function public.notify_admins_beta_payment() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare k text; tos text[]; pname text; owner_email text; owner_name text; total int;
begin
  if new.status <> 'awaiting_payment' or (tg_op = 'UPDATE' and old.status = 'awaiting_payment') then return new; end if;
  begin
    select decrypted_secret into k from vault.decrypted_secrets where name = 'resend_review_alerts' limit 1;
    select array_agg(email) into tos from profiles where role = 'admin' and coalesce(email, '') <> '' and not banned;
    if k is null or tos is null then return new; end if;
    select p.name, pr.email, pr.name into pname, owner_email, owner_name from products p left join profiles pr on pr.id = new.owner_id where p.id = new.product_id;
    total := new.airtime_amount * new.spots + ceil(new.airtime_amount * new.spots * public.beta_fee_pct());
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || k, 'Content-Type', 'application/json'),
      body := jsonb_build_object('from', 'Hentity Betas <noreply@hentity.com>', 'to', to_jsonb(tos),
        'subject', 'Payment needed: ' || pname || ' beta · ₦' || to_char(total, 'FM999,999,999'),
        'html', '<div style="font-family:Arial,sans-serif;max-width:560px"><h2 style="margin:0 0 6px">' || h_esc(new.title) || '</h2><p style="color:#555">' || h_esc(pname) || ' · ' || h_esc(coalesce(owner_name, '')) || ' · ' || h_esc(coalesce(owner_email, '')) || '</p>'
          || '<p>Airtime: ' || new.spots || ' testers × ₦' || to_char(new.airtime_amount, 'FM999,999') || ' + 5% fee = <b>₦' || to_char(total, 'FM999,999,999') || '</b></p>'
          || '<p>Send the maker payment details. When the money is in, mark it paid in Admin → Beta tests and the call goes live.</p>'
          || '<p style="margin:24px 0"><a href="https://hentity.com/admin#betas" style="background:#111;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">Open Admin</a></p></div>'));
  exception when others then raise warning 'beta payment email failed: %', sqlerrm;
  end;
  if new.owner_id is not null then
    insert into notifications (user_id, type, grp, product_id, title, body, link)
    values (new.owner_id, 'beta_payment', 'launches', new.product_id, 'Your beta call is waiting for payment', 'Hentity will email you how to pay ₦' || to_char(total, 'FM999,999,999') || '. It goes live once the money is in.', '/betas/' || new.id || '/manage');
  end if;
  return new;
end $$;
drop trigger if exists notify_admins_beta_payment on public.betas;
create trigger notify_admins_beta_payment after insert or update of status on public.betas for each row execute function public.notify_admins_beta_payment();

grant execute on function public.beta_set_payout(uuid, text, text), public.my_beta_payout(uuid), public.beta_nudge(uuid) to authenticated;
grant execute on function public.admin_beta_payouts(), public.admin_mark_payout(uuid, text), public.admin_beta_funded(uuid, boolean) to authenticated;
revoke execute on function public.guard_beta_money(), public.after_beta_feedback_payout(), public.notify_admins_beta_payment() from public, anon, authenticated;
