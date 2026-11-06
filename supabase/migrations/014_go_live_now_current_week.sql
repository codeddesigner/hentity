-- "Go live now" always puts the product on the week that is running right now (it used to keep the picked future week,
-- so a live product was filed under next week and didn't show on today's board).
create or replace function public.admin_review(p uuid, decision text, note text default null, items jsonb default '[]'::jsonb, wk integer default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare cur int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if decision not in ('scheduled','changes','rejected','live','review','archived','draft') then raise exception 'Unknown decision'; end if;
  if decision = 'live' then
    select id into cur from weeks where starts_at <= now() and ends_at > now() order by id limit 1;
    wk := coalesce(cur, wk);
  end if;
  update products set status = decision, review_note = note, review_items = coalesce(items,'[]'::jsonb),
    reviewed_at = now(), reviewed_by = auth.uid(), week_id = coalesce(wk, week_id) where id = p;
end $function$;
