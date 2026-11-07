-- Directory header counts every approved startup: launched (scheduled, live) and unclaimed pages published from the Radar
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'products', (select count(*) from products where status in ('scheduled', 'live')),
    'listed', (select count(*) from products where status in ('scheduled', 'live', 'unclaimed')),
    'countries', (select count(distinct country) from products where status in ('scheduled', 'live', 'unclaimed')),
    'makers', (select count(*) from profiles where not banned)
  );
$$;
