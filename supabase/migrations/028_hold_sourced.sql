-- Every startup sourced from public data stays in Admin -> Radar until an admin has vetted it and filled in
-- the required details. The 100 already published as unclaimed profiles are taken off the site ('held')
-- and go back to the review queue. Publishing a held one puts the same page back (same slug, upvotes and
-- follows kept); publishing a new one creates the page.

alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check
  check (status in ('draft','review','changes','scheduled','live','archived','rejected','unclaimed','held'));

-- Take the sourced profiles off the site and send them back for review
update public.products p set status = 'held'
where p.status = 'unclaimed' and p.owner_id is null and exists (select 1 from public.radar r where r.product_id = p.id);
update public.radar r set status = 'review', decided_at = null
from public.products p where p.id = r.product_id and p.status = 'held' and r.status = 'published';

-- What a sourced startup needs before it can go public. Returns the missing items (empty = ready).
create or replace function public.radar_missing(r public.radar) returns text[]
language sql stable set search_path = public as $$
  select array_remove(array[
    case when coalesce(trim(r.name), '') = '' then 'Name' end,
    case when coalesce(r.website, '') !~ '^https?://[^/]+\.[a-z]' then 'Website' end,
    case when coalesce(trim(r.tagline), '') = '' then 'Tagline' end,
    case when char_length(coalesce(trim(r.description), '')) < 80 then 'Description (at least 80 characters)' end,
    case when coalesce(r.country, '') = '' then 'Country' end,
    case when coalesce(trim(r.city), '') = '' then 'City' end,
    case when coalesce(cardinality(r.categories), 0) = 0 then 'Category' end,
    case when (select count(distinct lower(s)) from (
        select f->>'source' s from jsonb_array_elements(coalesce(r.facts, '[]'::jsonb)) f
        union all select n->>'source' from jsonb_array_elements(coalesce(r.news, '[]'::jsonb)) n) x
        where coalesce(s, '') <> '') < 2 then 'Two independent sources' end,
    case when not coalesce((r.checks->>'vetted')::boolean, false) then 'Marked as vetted' end
  ], null);
$$;
grant execute on function public.radar_missing(public.radar) to authenticated;

-- Duplicate check ignores the row's own held page
create or replace function public.radar_dupe(rid uuid) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select p.id from radar r join products p on (site_domain(p.website) = site_domain(r.website) and site_domain(r.website) is not null)
     or similarity(lower(p.name), lower(r.name)) > 0.6
  where r.id = rid and p.status not in ('archived','rejected') and p.id is distinct from r.product_id
  order by (site_domain(p.website) = site_domain(r.website)) desc limit 1;
$$;

create or replace function public.radar_publish(rid uuid, invite boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r radar; sl text; pid uuid; n int := 0; src int; miss text[];
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into r from radar where id = rid;
  if r.status <> 'review' then raise exception 'Already decided'; end if;
  miss := public.radar_missing(r);
  if cardinality(miss) > 0 then raise exception 'Add before publishing: %', array_to_string(miss, ', ') using errcode = 'P0001'; end if;
  if exists (select 1 from products where site_domain(website) = site_domain(r.website) and claim ? 'never_readd' and id is distinct from r.product_id) then raise exception 'This startup asked to be removed. It can''t be added again.'; end if;
  select count(distinct coalesce(f->>'source', '')) into src from jsonb_array_elements(r.facts) f;

  if r.product_id is not null and exists (select 1 from products where id = r.product_id and status = 'held') then
    -- Put the held page back with the vetted details
    update products set name = r.name, tagline = left(coalesce(r.tagline, ''), 140), description = coalesce(r.description, ''), website = coalesce(r.website, ''),
      categories = r.categories, country = r.country, city = coalesce(r.city, ''), status = 'unclaimed',
      claim = coalesce(claim, '{}'::jsonb) || jsonb_build_object('facts', r.facts, 'news', r.news, 'checked_at', now(), 'contact_email', r.contact_email,
        'sources', greatest(src, jsonb_array_length(r.news)), 'found_via', r.found_via)
    where id = r.product_id returning id, slug into pid, sl;
  else
    sl := trim(both '-' from regexp_replace(lower(r.name), '[^a-z0-9]+', '-', 'g'));
    if length(sl) < 2 then sl := sl || '-co'; end if;
    while exists (select 1 from products where slug = sl || case when n = 0 then '' else '-' || n end) loop n := n + 1; end loop;
    if n > 0 then sl := sl || '-' || n; end if;
    insert into products (slug, name, tagline, description, website, color, categories, country, city, status, owner_id, claim, stage, languages, platforms)
    values (sl, r.name, left(coalesce(r.tagline, ''), 140), coalesce(r.description, ''), coalesce(r.website, ''),
      (array['#16A34A','#2563EB','#9333EA','#EA580C','#0891B2','#B45309','#DB2777','#111111'])[1 + abs(hashtext(r.name)) % 8],
      r.categories, r.country, coalesce(r.city, ''), 'unclaimed', null,
      jsonb_build_object('facts', r.facts, 'news', r.news, 'spotted_at', r.created_at, 'checked_at', now(), 'contact_email', r.contact_email,
        'sources', greatest(src, jsonb_array_length(r.news)), 'found_via', r.found_via), '', '', '')
    returning id into pid;
  end if;

  update radar set status = 'published', product_id = pid, decided_at = now() where id = rid;
  if invite and r.contact_email ~ '@' then
    perform h_send_email(r.contact_email, r.name || ' is on Hentity. Claim your page',
      '<p>Hi ' || r.name || ' team,</p><p>Hentity is a launchpad for products built in Africa. We built a starter page for <b>' || r.name || '</b> from public sources (your website, news coverage and public registries).</p>'
      || '<p>Claim it in about 2 minutes to fix details, launch, and see who''s interested.</p>' || h_btn('https://hentity.com/claim/' || sl, 'Claim ' || r.name)
      || '<p style="color:#666">Not interested? <a href="https://hentity.com/products/' || sl || '?remove=1">Ask us to remove the page</a> and we won''t add it again.</p>', 'Hentity');
    update products set claim = claim || jsonb_build_object('invited_at', now()) where id = pid;
  end if;
  return jsonb_build_object('slug', sl, 'id', pid);
end $$;
