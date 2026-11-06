-- Logos on the radar: an admin adds the startup's logo while vetting it, and it carries over to the
-- public page when the startup is published (or put back on the site).
alter table public.radar add column if not exists logo_url text;

create or replace function public.radar_logo_to_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null and coalesce(new.logo_url, '') <> '' and new.status = 'published' then
    update products set logo_url = new.logo_url where id = new.product_id and logo_url is distinct from new.logo_url;
  end if;
  return new;
end $$;
drop trigger if exists radar_logo on public.radar;
create trigger radar_logo after update of status, product_id, logo_url on public.radar
  for each row execute function public.radar_logo_to_product();
