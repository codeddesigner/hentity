-- Unclaimed profiles can be upvoted (they're listed with every other product). Launch-week rankings still only
-- count launched products, because the weekly board filters by week.
create or replace function public.check_upvote() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text; o uuid;
begin
  select effective_status, owner_id into s, o from product_feed where id = new.product_id;
  if coalesce(s,'') not in ('live','unclaimed') then raise exception 'Upvotes open when the launch week starts'; end if;
  if o = new.user_id or exists (select 1 from product_makers where product_id = new.product_id and user_id = new.user_id) then raise exception 'Makers can''t upvote their own product'; end if;
  if exists (select 1 from profiles where id = new.user_id and banned) then raise exception 'Account suspended'; end if;
  return new;
end $$;
