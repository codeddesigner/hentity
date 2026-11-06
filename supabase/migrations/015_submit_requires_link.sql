-- Sending a product for review needs a product link, a founder profile (LinkedIn/X) and a maker introduction of 50+ characters.
create or replace function public.require_intro_on_submit() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'review' and (tg_op = 'INSERT' or old.status is distinct from 'review') and not public.is_admin() then
    if coalesce(trim(new.website), '') !~* '^https?://[^\s/]+\.[^\s]+' then
      raise exception 'Add your product link (a full web address starting with https://)' using errcode = 'P0001';
    end if;
    if coalesce(trim(new.verify->>'founder'), '') !~* '(linkedin\.com/(in|company)/|x\.com/|twitter\.com/)[A-Za-z0-9_.%-]{2,}' then
      raise exception 'Add the founder''s LinkedIn or X profile' using errcode = 'P0001';
    end if;
    if char_length(trim(coalesce(new.intro, ''))) < 50 then
      raise exception 'Your maker introduction needs at least 50 characters' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_intro_min on public.products;
create trigger products_intro_min before insert or update of status, intro, website, verify on public.products
  for each row execute function public.require_intro_on_submit();
