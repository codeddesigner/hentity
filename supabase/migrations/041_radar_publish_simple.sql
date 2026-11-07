-- Radar publishing, simplified: the admin edits a startup in a pop-up and publishes it. Only the basics are
-- required (name, website, tagline, country, category). Clicking Publish is the vetting. The admin can add the
-- Verified tick (with a registration number), and edits to an already-published startup go straight to its page.

alter table public.radar add column if not exists registration text;
alter table public.radar add column if not exists verified boolean not null default false;

create or replace function public.radar_missing(r radar) returns text[]
language sql stable set search_path = public as $$
  select array_remove(array[
    case when coalesce(trim(r.name), '') = '' then 'Name' end,
    case when coalesce(r.website, '') !~* '^https?://[^/]+\.[a-z]' then 'Website' end,
    case when coalesce(trim(r.tagline), '') = '' then 'Tagline' end,
    case when coalesce(r.country, '') = '' then 'Country' end,
    case when coalesce(cardinality(r.categories), 0) = 0 then 'Category' end,
    case when r.verified and coalesce(trim(r.registration), '') = '' then 'Registration number (for the Verified tick)' end
  ], null);
$$;

-- Copy the radar row's details onto its product page (logo, verified tick and registration included)
create or replace function public.radar_push(rid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r radar; p products;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from radar where id = rid;
  if r.product_id is null then raise exception 'Not published yet' using errcode = 'P0001'; end if;
  if r.verified and coalesce(trim(r.registration), '') = '' then raise exception 'Add the registration number to give it the Verified tick' using errcode = 'P0001'; end if;
  update products set name = r.name, tagline = left(coalesce(r.tagline, ''), 140), description = coalesce(r.description, ''), website = coalesce(r.website, ''),
    categories = r.categories, country = r.country, city = coalesce(r.city, ''), logo_url = coalesce(r.logo_url, logo_url),
    verify = case when coalesce(trim(r.registration), '') = '' then verify - 'company' else verify || jsonb_build_object('company', trim(r.registration)) end
  where id = r.product_id;
  update products set verified = r.verified where id = r.product_id;
  update products set claim = coalesce(claim, '{}'::jsonb) || jsonb_build_object('facts', r.facts, 'news', r.news, 'checked_at', now(), 'contact_email', r.contact_email)
    where id = r.product_id and status = 'unclaimed';
  select * into p from products where id = r.product_id;
  perform public.audit('radar.update_page', 'product', p.id::text, jsonb_build_object('name', p.name, 'verified', p.verified));
  return jsonb_build_object('slug', p.slug, 'id', p.id, 'verified', p.verified);
end $$;

drop function if exists public.radar_publish(uuid, boolean);
create or replace function public.radar_publish(rid uuid, invite boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r radar; sl text; pid uuid; n int := 0; src int; miss text[];
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from radar where id = rid;
  if r.id is null then raise exception 'Not found'; end if;
  if r.status = 'published' and r.product_id is not null then return public.radar_push(rid); end if;
  miss := public.radar_missing(r);
  if cardinality(miss) > 0 then raise exception 'Add before publishing: %', array_to_string(miss, ', ') using errcode = 'P0001'; end if;
  if exists (select 1 from products where site_domain(website) = site_domain(r.website) and claim ? 'never_readd' and id is distinct from r.product_id) then raise exception 'This startup asked to be removed. It can''t be added again.' using errcode = 'P0001'; end if;
  select count(distinct coalesce(f->>'source', '')) into src from jsonb_array_elements(coalesce(r.facts, '[]'::jsonb)) f;
  -- Publishing is the vetting
  update radar set checks = coalesce(checks, '{}'::jsonb) || jsonb_build_object('vetted', true, 'vetted_by', auth.uid(), 'vetted_at', now()) where id = rid;

  if r.product_id is not null and exists (select 1 from products where id = r.product_id and status = 'held') then
    update products set status = 'unclaimed' where id = r.product_id returning id, slug into pid, sl;
  else
    sl := trim(both '-' from regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g'));
    if length(sl) < 2 then sl := sl || '-co'; end if;
    while exists (select 1 from products where slug = sl || case when n = 0 then '' else '-' || n end) loop n := n + 1; end loop;
    if n > 0 then sl := sl || '-' || n; end if;
    insert into products (slug, name, tagline, description, website, color, categories, country, city, status, owner_id, claim, stage, languages, platforms, logo_url)
    values (sl, r.name, left(coalesce(r.tagline, ''), 140), coalesce(r.description, ''), coalesce(r.website, ''),
      (array['#16A34A','#2563EB','#9333EA','#EA580C','#0891B2','#B45309','#DB2777','#111111'])[1 + abs(hashtext(r.name)) % 8],
      r.categories, r.country, coalesce(r.city, ''), 'unclaimed', null,
      jsonb_build_object('facts', coalesce(r.facts, '[]'::jsonb), 'news', coalesce(r.news, '[]'::jsonb), 'spotted_at', r.created_at, 'checked_at', now(), 'contact_email', r.contact_email,
        'sources', greatest(src, jsonb_array_length(coalesce(r.news, '[]'::jsonb)), 1), 'found_via', r.found_via), '', '', '', r.logo_url)
    returning id into pid;
  end if;

  update radar set status = 'published', product_id = pid, decided_at = now() where id = rid;
  perform public.radar_push(rid);   -- details, logo, Verified tick, registration
  if invite and r.contact_email ~ '@' then
    perform h_send_email(r.contact_email, r.name || ' is on Hentity. Claim your page',
      '<p>Hi ' || h_esc(r.name) || ' team,</p><p>Hentity is a launchpad for products built in Africa. We built a starter page for <b>' || h_esc(r.name) || '</b> from public sources (your website, news coverage and public registries).</p>'
      || '<p>Claim it in about 2 minutes to fix details, launch, and see who''s interested.</p>' || h_btn('https://hentity.com/claim/' || sl, 'Claim ' || r.name)
      || '<p style="color:#666">Not interested? <a href="https://hentity.com/products/' || sl || '?remove=1">Ask us to remove the page</a> and we won''t add it again.</p>', 'Hentity');
    update products set claim = claim || jsonb_build_object('invited_at', now()) where id = pid;
  end if;
  perform public.audit('radar.publish', 'product', pid::text, jsonb_build_object('name', r.name, 'verified', r.verified));
  return jsonb_build_object('slug', sl, 'id', pid);
end $$;

-- Take a published startup off the site again (same page comes back if republished)
create or replace function public.radar_unpublish(rid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r radar;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from radar where id = rid;
  if r.product_id is null then return; end if;
  if exists (select 1 from products where id = r.product_id and status <> 'unclaimed') then raise exception 'This page has been claimed by its team, so it can''t be taken down from the Radar.' using errcode = 'P0001'; end if;
  update products set status = 'held' where id = r.product_id;
  update radar set status = 'review', decided_at = now() where id = rid;
  perform public.audit('radar.unpublish', 'product', r.product_id::text, jsonb_build_object('name', r.name));
end $$;

grant execute on function public.radar_publish(uuid, boolean), public.radar_push(uuid), public.radar_unpublish(uuid) to authenticated;
revoke execute on function public.radar_publish(uuid, boolean), public.radar_push(uuid), public.radar_unpublish(uuid) from anon;
