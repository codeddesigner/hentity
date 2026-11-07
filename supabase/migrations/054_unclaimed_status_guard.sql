-- Directory profiles (created by Hentity from public sources, no owner) are 'unclaimed', never 'live' or 'scheduled'.
-- 12 radar startups were moved held -> live on 7 Nov from the admin drawer, which had no 'unclaimed' option.
create or replace function public.guard_unclaimed_status() returns trigger language plpgsql as $$
begin
  if new.owner_id is null and new.claim is not null and new.status in ('live', 'scheduled') then
    new.status := 'unclaimed'; new.week_id := null; new.launch_date := null;
  end if;
  return new;
end $$;
drop trigger if exists guard_unclaimed_status on public.products;
create trigger guard_unclaimed_status before insert or update of status, owner_id on public.products
  for each row execute function public.guard_unclaimed_status();
update public.products set status = 'unclaimed' where owner_id is null and claim is not null and status in ('live', 'scheduled');
