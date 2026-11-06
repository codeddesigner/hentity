-- Founders with a public product get one email asking them to add a headline and bio, which now appear on
-- their product pages and in search results. Sent once per founder (again at most every 60 days if still empty),
-- never when they've turned off launch emails or paused notifications.

create table if not exists public.profile_nudges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, sent_at)
);
alter table public.profile_nudges enable row level security;
drop policy if exists "nudges admin" on public.profile_nudges;
create policy "nudges admin" on public.profile_nudges for select using (public.is_admin());

create or replace function public.nudge_profile(uid uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare u profiles; p products; missing text[];
begin
  select * into u from profiles where id = uid;
  if u.id is null or u.banned or coalesce(u.email, '') !~ '@' then return false; end if;
  if coalesce(trim(u.bio), '') <> '' and coalesce(trim(u.headline), '') <> '' then return false; end if;
  if coalesce((u.settings -> 'notif' ->> 'scheduled.1')::boolean, true) = false then return false; end if;
  if (u.settings ->> 'pause_until') is not null and (u.settings ->> 'pause_until')::timestamptz > now() then return false; end if;
  if exists (select 1 from profile_nudges where user_id = uid and kind = 'bio' and sent_at > now() - interval '60 days') then return false; end if;
  select * into p from products where owner_id = uid and status in ('scheduled', 'live') order by created_at desc limit 1;
  if p.id is null then return false; end if;
  missing := array_remove(array[case when coalesce(trim(u.headline), '') = '' then 'a one-line headline (for example “Founder, ' || p.name || '”)' end,
                                case when coalesce(trim(u.bio), '') = '' then 'a short bio: what you’re building, your background, where you’re based' end], null);
  perform h_send_email(u.email, 'Help people find ' || p.name || ': add your founder bio',
    '<p>Hi ' || split_part(coalesce(u.name, ''), ' ', 1) || ',</p>'
    || '<p>' || p.name || '’s page on Hentity now shows the people behind it, and search engines like Google read that section too. Investors, journalists and early users often search for a founder by name before they try a product.</p>'
    || '<p>Your profile is missing:</p><ul>' || (select string_agg('<li>' || m || '</li>', '') from unnest(missing) m) || '</ul>'
    || '<p>It takes about a minute, and it shows up on every product you make.</p>'
    || h_btn('https://hentity.com/settings/profile', 'Add your bio')
    || '<p style="color:#666">You get this because you have a product on Hentity. You can turn off launch emails in your notification settings.</p>',
    'Hentity');
  insert into profile_nudges (user_id, kind) values (uid, 'bio');
  return true;
end $$;
revoke execute on function public.nudge_profile(uuid) from public, anon, authenticated;

-- Send it when a founder's product is approved (scheduled) or goes live
create or replace function public.nudge_on_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and new.status in ('scheduled', 'live') and old.status is distinct from new.status then
    perform public.nudge_profile(new.owner_id);
  end if;
  return new;
end $$;
drop trigger if exists products_nudge_profile on public.products;
create trigger products_nudge_profile after update of status on public.products
  for each row execute function public.nudge_on_publish();

-- Founders who already have a public product and an incomplete profile get it now
select public.nudge_profile(id) from (select distinct owner_id id from public.products where owner_id is not null and status in ('scheduled', 'live')) f;
