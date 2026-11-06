-- A product can't be sent for review unless the maker introduction has at least 50 characters.
create or replace function public.require_intro_on_submit() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'review' and (tg_op = 'INSERT' or old.status is distinct from 'review')
     and not public.is_admin() and char_length(trim(coalesce(new.intro, ''))) < 50 then
    raise exception 'Your maker introduction needs at least 50 characters' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists products_intro_min on public.products;
create trigger products_intro_min before insert or update of status, intro on public.products
  for each row execute function public.require_intro_on_submit();
