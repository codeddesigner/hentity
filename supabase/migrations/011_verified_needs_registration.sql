-- The Verified stamp is issued by admins only, and only once a company registration number is on file.
-- Registration itself stays optional for makers: products without one can still launch, just unverified.

-- Registration number for a product: what the maker entered on the submit form, else its company's.
create or replace function public.product_registration(p public.products) returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(coalesce(p.verify->>'company', (select registration from companies where id = p.company_id), '')), '')
$$;

create or replace function public.require_registration_for_verified() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'products' then
    if new.verified and (tg_op = 'INSERT' or not old.verified) and public.product_registration(new) is null then
      raise exception 'Add a company registration number before marking this product verified' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'companies' then
    if new.verified and nullif(trim(coalesce(new.registration, '')), '') is null then
      raise exception 'Add a registration number before marking this company verified' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists products_verified_needs_registration on public.products;
create trigger products_verified_needs_registration before insert or update of verified, verify, company_id on public.products
  for each row execute function public.require_registration_for_verified();

drop trigger if exists companies_verified_needs_registration on public.companies;
create trigger companies_verified_needs_registration before insert or update of verified, registration on public.companies
  for each row execute function public.require_registration_for_verified();

-- Makers can't keep a company "verified" by editing its registration afterwards: changing it clears the stamp.
create or replace function public.guard_company() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then new.verified := false; new.owner_id := auth.uid(); return new; end if;
  new.owner_id := old.owner_id;
  if new.registration is distinct from old.registration then new.verified := false; else new.verified := old.verified; end if;
  return new;
end $$;
drop trigger if exists guard_company on public.companies;
create trigger guard_company before insert or update on public.companies for each row execute function public.guard_company();

revoke execute on function public.product_registration(public.products) from anon;
