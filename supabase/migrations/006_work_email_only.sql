-- Sign-up is limited to work email addresses. Free-mail and disposable domains are blocked;
-- 'name.*' entries match any ending (yahoo.com, yahoo.co.uk ...) and subdomains. Admins manage the
-- list (Admin -> Site settings -> Sign-up rules) and per-address exceptions in site_settings.signup.
create table if not exists public.blocked_email_domains (
  domain text primary key check (domain = lower(domain)),
  created_at timestamptz not null default now()
);
alter table public.blocked_email_domains enable row level security;
create policy "blocked domains admin" on public.blocked_email_domains for all using (is_admin()) with check (is_admin());

insert into public.blocked_email_domains(domain) values
 ('gmail.com'),('googlemail.com'),('yahoo.*'),('ymail.com'),('rocketmail.com'),('hotmail.*'),('outlook.*'),('live.*'),('msn.com'),('passport.com'),
 ('icloud.com'),('me.com'),('mac.com'),('aol.*'),('aim.com'),('proton.me'),('protonmail.*'),('pm.me'),('gmx.*'),('mail.com'),('email.com'),
 ('yandex.*'),('ya.ru'),('zoho.com'),('zohomail.com'),('tutanota.*'),('tuta.io'),('hey.com'),('fastmail.*'),('qq.com'),('163.com'),('126.com'),
 ('sina.com'),('mail.ru'),('inbox.ru'),('list.ru'),('bk.ru'),('rambler.ru'),('web.de'),('t-online.de'),('libero.it'),('orange.fr'),('free.fr'),
 ('laposte.net'),('wanadoo.fr'),('rediffmail.com'),('inbox.com'),('hushmail.com'),('lycos.com'),('naver.com'),('daum.net'),('comcast.net'),
 ('verizon.net'),('att.net'),('sbcglobal.net'),('cox.net'),('btinternet.com'),('sky.com'),('virginmedia.com'),('mweb.co.za'),('webmail.co.za'),
 ('telkomsa.net'),('vodamail.co.za'),('ymail.co.za'),
 ('mailinator.com'),('guerrillamail.*'),('sharklasers.com'),('10minutemail.*'),('tempmail.*'),('temp-mail.*'),('yopmail.*'),('trashmail.*'),
 ('throwawaymail.com'),('getnada.com'),('maildrop.cc'),('dispostable.com'),('mintemail.com'),('mohmal.com'),('emailondeck.com'),('fakeinbox.com')
on conflict do nothing;

-- Keep the bootstrap admin address working.
insert into public.site_settings(key, value) values ('signup', '{"exceptions":["encircode@gmail.com"]}'::jsonb)
on conflict (key) do nothing;

create or replace function public.work_email_ok(e text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare d text := lower(split_part(trim(coalesce(e,'')), '@', 2));
begin
  if d = '' or position('.' in d) = 0 then return false; end if;
  if exists (select 1 from site_settings s, jsonb_array_elements_text(coalesce(s.value->'exceptions','[]'::jsonb)) x
             where s.key = 'signup' and lower(x) = lower(trim(e))) then return true; end if;
  return not exists (select 1 from blocked_email_domains b
    where d = b.domain
       or (b.domain like '%.*' and (d like replace(b.domain, '.*', '.') || '%' or d like '%.' || replace(b.domain, '.*', '.') || '%'))
       or (b.domain not like '%.*' and d like '%.' || b.domain));
end $$;
revoke execute on function public.work_email_ok(text) from public;
grant execute on function public.work_email_ok(text) to anon, authenticated;

-- Enforced in the database, so the API can't be used to get around the sign-up form.
create or replace function public.enforce_work_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and not public.work_email_ok(new.email) then
    raise exception 'WORK_EMAIL_REQUIRED: sign up with your work email';
  end if;
  if tg_op = 'UPDATE' and coalesce(new.email_change,'') <> '' and new.email_change is distinct from old.email_change
     and not public.work_email_ok(new.email_change) then
    raise exception 'WORK_EMAIL_REQUIRED: use your work email';
  end if;
  return new;
end $$;
revoke execute on function public.enforce_work_email() from public, anon, authenticated;
drop trigger if exists enforce_work_email on auth.users;
create trigger enforce_work_email before insert or update on auth.users for each row execute function public.enforce_work_email();
