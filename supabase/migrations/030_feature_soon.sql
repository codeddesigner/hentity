-- Features get a third state, "soon" (Coming soon): visible in menus with a label, but unusable.
-- Only a missing key or true counts as on; false and "soon" are both blocked for non-admins.
create or replace function public.feature_on(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(value ->> k, 'true') = 'true' from site_settings where key = 'features'), true);
$$;
-- Validate an idea starts as Coming soon
update public.site_settings set value = value || '{"validate":"soon"}'::jsonb where key = 'features';
