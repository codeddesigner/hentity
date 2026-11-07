-- Operating status: is the startup still running? Inactive startups stay listed but show greyed out
-- with an "Inactive" tag and a short note (shut down, renamed, in administration...). Admins decide.
alter table public.products add column if not exists active boolean not null default true;
alter table public.products add column if not exists inactive_note text;
alter table public.radar add column if not exists active boolean not null default true;
alter table public.radar add column if not exists inactive_note text;

create or replace view public.product_feed as
 SELECT p.id, p.slug, p.name, p.tagline, p.description, p.website, p.color, p.logo_url, p.media, p.video_url, p.categories,
    p.country, p.city, p.countries, p.pay_methods, p.currencies, p.languages, p.platforms, p.stage, p.company_id, p.owner_id,
    p.status, p.week_id, p.intro, p.support_pledge, p.featured, p.promoted, p.verified, p.verify, p.review_note, p.review_items,
    p.submitted_at, p.reviewed_at, p.reviewed_by, p.upvote_count, p.comment_count, p.follower_count, p.click_count, p.view_count,
    p.created_at, p.updated_at,
    CASE WHEN p.status = 'scheduled' AND COALESCE(launch_at(p.launch_date), w.starts_at) <= now() THEN 'live'::text ELSE p.status END AS effective_status,
    w.starts_at AS week_starts_at, w.ends_at AS week_ends_at, p.launch_date,
    (EXISTS (SELECT 1 FROM betas b WHERE b.product_id = p.id AND b.status = 'open' AND b.closes_at > now() AND b.accepted_count < b.spots
       AND COALESCE((b.settings ->> 'show_on_product')::boolean, true))) AS testers_wanted,
    CASE WHEN p.claim = '{}'::jsonb THEN '{}'::jsonb ELSE
      p.claim - 'contact_email' || jsonb_build_object('facts', COALESCE((SELECT jsonb_agg(f) FROM jsonb_array_elements(p.claim->'facts') f WHERE NOT COALESCE((f->>'hidden')::boolean, false)), '[]'::jsonb)) END AS claim,
    p.claimed_at,
    p.active, p.inactive_note
   FROM products p LEFT JOIN weeks w ON w.id = p.week_id;

-- Radar edits carry the status to the page
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
    active = r.active, inactive_note = case when r.active then null else nullif(trim(r.inactive_note), '') end,
    verify = case when coalesce(trim(r.registration), '') = '' then verify - 'company' else verify || jsonb_build_object('company', trim(r.registration)) end
  where id = r.product_id;
  update products set verified = r.verified where id = r.product_id;
  update products set claim = coalesce(claim, '{}'::jsonb) || jsonb_build_object('facts', r.facts, 'news', r.news, 'checked_at', now(), 'contact_email', r.contact_email)
    where id = r.product_id and status = 'unclaimed';
  select * into p from products where id = r.product_id;
  perform public.audit('radar.update_page', 'product', p.id::text, jsonb_build_object('name', p.name, 'verified', p.verified, 'active', p.active));
  return jsonb_build_object('slug', p.slug, 'id', p.id, 'verified', p.verified);
end $$;

-- Reality as of Nov 2026 (sources: TechCabal, Techpoint, Nairametrics, Launch Base Africa, WeeTracker, Shore Africa)
update public.radar r set active = false, inactive_note = v.note from (values
  ('54gene', 'Shut down in 2023'),
  ('Lazerpay', 'Shut down in 2023'),
  ('Sendy', 'Became insolvent in 2023'),
  ('Thepeer', 'Shut down in 2024'),
  ('MarketForce', 'Shut down in April 2024'),
  ('Copia', 'Went into administration in May 2024'),
  ('iProcure', 'Went into administration in April 2024'),
  ('MVXchange', 'Shut down in 2024'),
  ('Edukoya', 'Shut down in February 2025'),
  ('Bento Africa', 'Halted operations in 2025'),
  ('Lipa Later', 'Went into administration in March 2025'),
  ('Okra', 'Shut down in 2025'),
  ('Heroshe', 'Ceased operations in 2025'),
  ('Lidya', 'Ceased operations in October 2025'),
  ('KOKO Networks', 'Shut down in January 2026'),
  ('Twiga Foods', 'Went into administration in 2026'),
  ('Sky.Garden', 'Shut down in 2022'),
  ('WeFarm', 'Went into administration in 2022'),
  ('Zazuu', 'Shut down in 2020'),
  ('Masoko', 'Closed by Safaricom'),
  ('Eventtus', 'Acquired by Hopin in 2021'),
  ('Otlob', 'Now part of Talabat'),
  ('Opibus', 'Renamed Roam'),
  ('Lulalend', 'Renamed Lula'),
  ('Geegpay', 'Renamed Raenest'),
  ('Rensource', 'Pivoted away from this business')
) v(name, note) where r.name = v.name;
update public.products p set active = r.active, inactive_note = r.inactive_note from public.radar r where r.product_id = p.id and not r.active;
