-- Funding (Figma page "Funding", 202:563 / 203:490): grants and equity in one place, matched to the founder's
-- listed product. Opportunities are curated by Hentity admins (real programmes and investors only), each with a
-- link to the official source. The founder's application package comes from the product page, Studio betas,
-- comments and a private Data room. Funders get time-limited, revocable links to the files.

-- ---------------------------------------------------------------- catalogue
create table if not exists public.funding_opps (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('grant','equity')),
  kind text not null check (kind in ('grant','prize','competition','vc','angel','accelerator','micro_vc')),
  name text not null check (char_length(name) between 2 and 120),
  org text not null default '',
  color text not null default '#111111',
  logo_url text,
  website text not null default '',
  apply_url text not null default '',
  amount_text text not null default '',          -- "$25,000", "£50,000 first prize", "$100k–$500k"
  amount_note text not null default '',          -- "Non-dilutive", "Competition", "$60k for 7%", "12 weeks"
  amount_usd numeric,                             -- for sorting by amount
  categories text[] not null default '{}',       -- empty = any category
  stages text[] not null default '{}',           -- empty = any stage
  countries text[] not null default '{}',        -- empty = all of Africa
  region_label text not null default '',         -- "West & East Africa", "All of Africa"
  women_only boolean not null default false,     -- women-founded or mixed teams
  needs_incorporation boolean not null default false,
  needs_live boolean not null default false,     -- working product with users
  deadline date,                                  -- null = rolling / see their site
  decision_by date,
  slots_text text not null default '',
  round_note text not null default '',          -- "2026 round closed 8 Sep · next round expected mid-2027"
  how text not null default 'apply' check (how in ('apply','pitch','intro')),   -- equity: how they take deals
  judging jsonb not null default '[]',            -- [{label, pct}]
  description text not null default '',
  source_url text not null default '',            -- where the details were checked
  checked_at date,
  portfolio uuid[] not null default '{}',         -- products on Hentity they backed (for warm intros)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
alter table public.funding_opps enable row level security;
drop policy if exists "funding opps read" on public.funding_opps;
create policy "funding opps read" on public.funding_opps for select using (active or public.is_admin());
drop policy if exists "funding opps admin" on public.funding_opps;
create policy "funding opps admin" on public.funding_opps for all using (public.is_admin()) with check (public.is_admin());
grant select on public.funding_opps to anon, authenticated;
grant insert, update, delete on public.funding_opps to authenticated;

-- Where pitches and applications are emailed (private; only admins see it)
create table if not exists public.funding_contacts (
  opp_id uuid primary key references public.funding_opps(id) on delete cascade,
  email text not null check (email ~ '@'));
alter table public.funding_contacts enable row level security;
drop policy if exists "funding contacts admin" on public.funding_contacts;
create policy "funding contacts admin" on public.funding_contacts for all using (public.is_full_admin()) with check (public.is_full_admin());
grant select, insert, update, delete on public.funding_contacts to authenticated;

create table if not exists public.funding_saves (
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  opp_id uuid not null references public.funding_opps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, opp_id));
alter table public.funding_saves enable row level security;
drop policy if exists "funding saves own" on public.funding_saves;
create policy "funding saves own" on public.funding_saves for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.funding_saves to authenticated;

-- ---------------------------------------------------------------- data room
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dataroom', 'dataroom', false, 20971520, array['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv','image/png','image/jpeg'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.dataroom_items (
  product_id uuid not null references public.products(id) on delete cascade,
  kind text not null check (kind in ('deck','financials','cap_table','incorporation','traction')),
  path text,                    -- storage path in "dataroom" (files)
  file_name text,
  text_value text,              -- traction (written)
  version int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (product_id, kind));
alter table public.dataroom_items enable row level security;
drop policy if exists "dataroom team" on public.dataroom_items;
create policy "dataroom team" on public.dataroom_items for all using (public.is_maker(product_id) or public.is_full_admin()) with check (public.is_maker(product_id));
grant select, insert, update, delete on public.dataroom_items to authenticated;

-- files live under <product_id>/...
drop policy if exists "dataroom files team" on storage.objects;
create policy "dataroom files team" on storage.objects for all to authenticated
  using (bucket_id = 'dataroom' and public.is_maker(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'dataroom' and public.is_maker(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------- applications
create table if not exists public.funding_apps (
  id uuid primary key default gen_random_uuid(),
  opp_id uuid not null references public.funding_opps(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  status text not null default 'draft' check (status in ('draft','submitted','pitch_sent','intro_requested','shortlisted','accepted','declined','withdrawn')),
  answers jsonb not null default '{}',       -- {use_of_funds}
  attach jsonb not null default '[]',        -- what was shared: ["product","deck",...]
  note text not null default '' check (char_length(note) <= 1200),
  intro_via uuid references public.products(id) on delete set null,
  sent_to text,                              -- 'email' | 'site' | 'hentity'
  access_until timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opp_id, product_id));
alter table public.funding_apps enable row level security;
drop policy if exists "funding apps team" on public.funding_apps;
create policy "funding apps team" on public.funding_apps for select using (user_id = auth.uid() or public.is_maker(product_id) or public.is_admin());
drop policy if exists "funding apps admin" on public.funding_apps;
create policy "funding apps admin" on public.funding_apps for update using (public.is_admin()) with check (public.is_admin());
grant select, update on public.funding_apps to authenticated;

-- ---------------------------------------------------------------- matching
-- The facts we match on, from the product page, founders, Studio, comments and the Data room
create or replace function public.funding_facts(pid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'name', p.name, 'tagline', p.tagline, 'logo_url', p.logo_url, 'color', p.color, 'verified', p.verified,
    'categories', coalesce(p.categories, '{}'), 'stage', nullif(p.stage, ''), 'country', nullif(p.country, ''), 'city', nullif(p.city, ''),
    'status', p.status, 'live', p.status in ('live','scheduled','unclaimed'),
    'incorporated', coalesce(nullif(trim(p.verify ->> 'company'), ''), null), 'founded_year', p.founded_year,
    'team', (select team from product_founders where product_id = p.id), 'founders', (select founders from product_founders where product_id = p.id),
    'makers', (select count(*) from product_makers m where m.product_id = p.id and m.accepted) + case when p.owner_id is not null then 1 else 0 end,
    'testers', (select coalesce(sum(b.accepted_count), 0) from betas b where b.product_id = p.id),
    'beta_rating', (select round(avg(f.ease)::numeric, 1) from beta_feedback f join betas b on b.id = f.beta_id where b.product_id = p.id),
    'comments', p.comment_count, 'followers', p.follower_count, 'upvotes', p.upvote_count,
    'dataroom', (select coalesce(jsonb_object_agg(kind, jsonb_build_object('file', file_name, 'text', left(text_value, 140), 'version', version, 'at', updated_at)), '{}') from dataroom_items d where d.product_id = p.id))
  from products p where p.id = pid and (public.is_maker(pid) or public.is_admin());
$$;
grant execute on function public.funding_facts(uuid) to authenticated;

-- One opportunity checked against one product, criterion by criterion, with the evidence beside each
create or replace function public.funding_checks(o funding_opps, fx jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare c jsonb := '[]'; cats text[]; cc text := fx ->> 'country'; team text := fx ->> 'team';
  CN jsonb := '{"NG":"Nigeria","KE":"Kenya","GH":"Ghana","ZA":"South Africa","RW":"Rwanda","EG":"Egypt","MA":"Morocco","SN":"Senegal","ET":"Ethiopia","UG":"Uganda","TZ":"Tanzania","CI":"Côte d’Ivoire","CM":"Cameroon","TN":"Tunisia","DZ":"Algeria","BJ":"Benin","TG":"Togo","ZM":"Zambia","ZW":"Zimbabwe"}';
begin
  select coalesce(array_agg(x), '{}') into cats from jsonb_array_elements_text(fx -> 'categories') x;
  if cardinality(o.categories) > 0 then
    c := c || jsonb_build_object('key', 'category', 'label', array_to_string(o.categories, ', ') || (case when cardinality(o.categories) = 1 then ' startups' else '' end),
      'ok', cats && o.categories, 'evidence', coalesce(fx ->> 'name', '') || ' · ' || coalesce(array_to_string(cats, ', '), 'No category'));
  end if;
  if cardinality(o.stages) > 0 then
    c := c || jsonb_build_object('key', 'stage', 'label', array_to_string(o.stages, ' or '), 'ok', fx ->> 'stage' = any(o.stages), 'evidence', coalesce(fx ->> 'stage', 'Stage not set'));
  end if;
  if cardinality(o.countries) > 0 then
    c := c || jsonb_build_object('key', 'country', 'label', 'Operating in ' || coalesce(nullif(o.region_label, ''), array_to_string(o.countries, ', ')), 'ok', cc = any(o.countries), 'evidence', coalesce(CN ->> cc, cc, 'Country not set'));
  end if;
  if o.women_only then
    c := c || jsonb_build_object('key', 'women', 'label', 'Women-founded or mixed team', 'ok', team in ('women','mixed'),
      'evidence', case team when 'women' then 'Women-founded' when 'mixed' then 'Mixed team' when 'men' then 'Men-founded' else 'Founding team not set' end);
  end if;
  if o.needs_incorporation then
    c := c || jsonb_build_object('key', 'incorporated', 'label', 'Incorporated in Africa', 'ok', fx ->> 'incorporated' is not null,
      'evidence', case when fx ->> 'incorporated' is not null then coalesce(CN ->> cc, cc, '') || coalesce(', ' || (fx ->> 'founded_year'), '') else 'Add your registration number' end);
  end if;
  if o.needs_live then
    c := c || jsonb_build_object('key', 'live', 'label', 'Working product with users', 'ok', (fx ->> 'live')::boolean,
      'evidence', case when (fx ->> 'live')::boolean then 'Live on Hentity' || case when (fx ->> 'testers')::int > 0 then ' · ' || (fx ->> 'testers') || ' testers' else '' end else 'Not live yet' end);
  end if;
  c := c || jsonb_build_object('key', 'team', 'label', 'Founding team on file', 'ok', team is not null and team <> 'unstated',
    'evidence', case when team is null or team = 'unstated' then 'Add your founding team' else coalesce((fx ->> 'founders') || ' founders', (fx ->> 'makers') || ' on the team') end);
  return c;
end $$;

create or replace function public.funding_board(pid uuid, md text default 'grant') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fx jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = 'P0001'; end if;
  fx := public.funding_facts(pid);
  if fx is null then raise exception 'Pick one of your products' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'product', fx,
    'counts', (select jsonb_build_object('grant', count(*) filter (where mode = 'grant'), 'equity', count(*) filter (where mode = 'equity')) from funding_opps where active and (deadline is null or deadline >= current_date)),
    'opps', (select coalesce(jsonb_agg(x order by (x ->> 'meets')::numeric / greatest((x ->> 'total')::numeric, 1) desc, x ->> 'deadline' nulls last), '[]') from (
      select to_jsonb(o) - 'portfolio' || jsonb_build_object(
        'checks', ch, 'total', jsonb_array_length(ch), 'meets', (select count(*) from jsonb_array_elements(ch) e where (e ->> 'ok')::boolean),
        'saved', exists (select 1 from funding_saves s where s.opp_id = o.id and s.user_id = auth.uid()),
        'can_email', exists (select 1 from funding_contacts fc where fc.opp_id = o.id),
        'intro_via', (select coalesce(jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'slug', pp.slug)), '[]') from products pp where pp.id = any(o.portfolio) and pp.owner_id is not null and pp.status in ('live','scheduled')),
        'app', (select jsonb_build_object('id', a.id, 'status', a.status, 'updated_at', a.updated_at) from funding_apps a where a.opp_id = o.id and a.product_id = pid)) x
      from funding_opps o, lateral (select public.funding_checks(o, fx) ch) k
      where o.active and o.mode = md and (o.deadline is null or o.deadline >= current_date)) t),
    'apps', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'opp_id', o.id, 'name', o.name, 'mode', o.mode, 'status', a.status, 'answers', a.answers, 'access_until', a.access_until) order by a.updated_at desc), '[]')
             from funding_apps a join funding_opps o on o.id = a.opp_id where a.product_id = pid));
end $$;
grant execute on function public.funding_board(uuid, text) to authenticated;

create or replace function public.funding_opp(oid uuid, pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o funding_opps; fx jsonb; ch jsonb;
begin
  select * into o from funding_opps where id = oid and (active or public.is_admin());
  if o.id is null then raise exception 'This opportunity is no longer open' using errcode = 'P0001'; end if;
  fx := public.funding_facts(pid);
  if fx is null then raise exception 'Pick one of your products' using errcode = 'P0001'; end if;
  ch := public.funding_checks(o, fx);
  return to_jsonb(o) - 'portfolio' || jsonb_build_object('product', fx, 'checks', ch, 'total', jsonb_array_length(ch),
    'meets', (select count(*) from jsonb_array_elements(ch) e where (e ->> 'ok')::boolean),
    'can_email', exists (select 1 from funding_contacts fc where fc.opp_id = o.id),
    'intro_via', (select coalesce(jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.name, 'slug', pp.slug)), '[]') from products pp where pp.id = any(o.portfolio) and pp.owner_id is not null and pp.status in ('live','scheduled')),
    'app', (select to_jsonb(a) from funding_apps a where a.opp_id = o.id and a.product_id = pid));
end $$;
grant execute on function public.funding_opp(uuid, uuid) to authenticated;

-- Save a draft, or send it. links: [{label, url}] signed, time-limited file links made by the founder's browser.
create or replace function public.funding_send(oid uuid, pid uuid, act text, answers jsonb default '{}', attach jsonb default '[]', note text default '', links jsonb default '[]', via uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o funding_opps; p products; a funding_apps; st text; to_addr text; html text; until timestamptz; l jsonb; me profiles;
begin
  if not public.is_maker(pid) then raise exception 'Only the team can apply for this product' using errcode = 'P0001'; end if;
  select * into o from funding_opps where id = oid and active;
  if o.id is null then raise exception 'This opportunity is no longer open' using errcode = 'P0001'; end if;
  select * into p from products where id = pid;
  select * into me from profiles where id = auth.uid();
  st := case act when 'draft' then 'draft' when 'apply' then 'submitted' when 'pitch' then 'pitch_sent' when 'intro' then 'intro_requested' when 'withdraw' then 'withdrawn' else null end;
  if st is null then raise exception 'Unknown action' using errcode = 'P0001'; end if;
  until := case when act = 'pitch' then now() + interval '30 days' else coalesce(o.decision_by::timestamptz + interval '14 days', now() + interval '60 days') end;
  select email into to_addr from funding_contacts where opp_id = oid;

  insert into funding_apps (opp_id, product_id, user_id, status, answers, attach, note, intro_via)
  values (oid, pid, auth.uid(), st, coalesce(answers, '{}'), coalesce(attach, '[]'), left(coalesce(note, ''), 1200), via)
  on conflict (opp_id, product_id) do update set status = case when act = 'draft' and funding_apps.status <> 'draft' then funding_apps.status else excluded.status end,
    answers = excluded.answers, attach = excluded.attach, note = excluded.note, intro_via = coalesce(excluded.intro_via, funding_apps.intro_via), updated_at = now()
  returning * into a;

  if act in ('apply','pitch') then
    -- Only signed links to Hentity's own storage, plus the public product page
    for l in select * from jsonb_array_elements(coalesce(links, '[]')) loop
      if not (l ->> 'url' like 'https://sislzikhjapilksictxd.supabase.co/storage/v1/object/sign/dataroom/' || pid::text || '/%' or l ->> 'url' like 'https://hentity.com/%') then
        raise exception 'Unexpected link' using errcode = 'P0001'; end if;
    end loop;
    if to_addr is not null then
      html := '<p>' || h_esc(coalesce(me.name, 'A founder')) || ' sent ' || case when act = 'pitch' then 'a pitch' else 'an application for <b>' || h_esc(o.name) || '</b>' end || ' through Hentity.</p>'
        || '<p><b>' || h_esc(p.name) || '</b>: ' || h_esc(coalesce(p.tagline, '')) || '</p>'
        || case when coalesce(note, '') <> '' then '<p style="white-space:pre-wrap">' || h_esc(note) || '</p>' else '' end
        || case when coalesce(answers ->> 'use_of_funds', '') <> '' then '<p><b>How they’ll use the funds</b><br>' || h_esc(answers ->> 'use_of_funds') || '</p>' else '' end
        || '<ul>' || (select coalesce(string_agg('<li><a href="' || h_esc(x ->> 'url') || '">' || h_esc(x ->> 'label') || '</a></li>', ''), '') from jsonb_array_elements(coalesce(links, '[]')) x) || '</ul>'
        || '<p style="color:#666">Files open until ' || to_char(until, 'DD Mon YYYY') || '. Reply to this email to reach ' || h_esc(coalesce(me.name, 'the founder')) || ' directly.</p>';
      perform h_send_email(to_addr, (case when act = 'pitch' then 'Pitch: ' else 'Application: ' end) || p.name || ' via Hentity', html, 'Hentity Funding');
      update funding_apps set sent_to = 'email', submitted_at = now(), access_until = until where id = a.id returning * into a;
    else
      update funding_apps set sent_to = 'site', submitted_at = now(), access_until = until where id = a.id returning * into a;
    end if;
  elsif act = 'intro' then
    if via is not null and exists (select 1 from products where id = via and id = any(o.portfolio)) then
      perform notify((select owner_id from products where id = via), 'system', 'system', coalesce(me.name, 'A founder') || ' asked you for an intro to ' || o.name,
        p.name || ': ' || left(coalesce(note, ''), 140), '/products/' || p.slug);
      update funding_apps set sent_to = 'founder', submitted_at = now() where id = a.id returning * into a;
    else
      perform notify(x.id, 'system', 'system', 'Intro request: ' || p.name || ' → ' || o.name, left(coalesce(note, ''), 160), '/admin#funding')
        from profiles x where x.role = 'admin' and not x.banned;
      update funding_apps set sent_to = 'hentity', submitted_at = now() where id = a.id returning * into a;
    end if;
  end if;
  return to_jsonb(a);
end $$;
grant execute on function public.funding_send(uuid, uuid, text, jsonb, jsonb, text, jsonb, uuid) to authenticated;

-- Admin view of applications
create or replace function public.admin_funding_apps() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_admin() then '[]'::jsonb else coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'status', a.status, 'sent_to', a.sent_to, 'note', a.note,
    'submitted_at', a.submitted_at, 'updated_at', a.updated_at, 'opp', o.name, 'mode', o.mode, 'product', p.name, 'slug', p.slug) order by a.updated_at desc), '[]') end
  from funding_apps a join funding_opps o on o.id = a.opp_id join products p on p.id = a.product_id;
$$;
grant execute on function public.admin_funding_apps() to authenticated;

-- Feature switch (on by default for founders)
insert into public.site_settings (key, value) select 'features', '{}'::jsonb where not exists (select 1 from public.site_settings where key = 'features');

-- ---------------------------------------------------------------- starting catalogue (checked Nov 2026)
-- Real programmes and investors only. Rounds that have closed say so; admins add dates as new rounds open.
create unique index if not exists funding_opps_name on public.funding_opps (name);
insert into public.funding_opps (mode, kind, name, org, color, website, apply_url, amount_text, amount_note, amount_usd, categories, stages, countries, region_label, women_only, needs_incorporation, needs_live, round_note, how, description, source_url, checked_at) values
('grant','grant','TEF Entrepreneurship Programme','Tony Elumelu Foundation','#C8102E','https://www.tonyelumelufoundation.org/','https://www.tonyelumelufoundation.org/','$5,000','Non-refundable seed capital',5000,'{}','{Idea,Pre-seed}','{}','All 54 African countries',false,false,false,'2026 round closed 1 Mar · opens yearly on TEFConnect','apply','Seed capital, business training and mentorship for early African entrepreneurs.','https://techmoran.com/2026/02/03/tony-elumelu-foundation-tef-opens-2026-applications-with-5000-seed-capital-for-african-founders/','2026-11-07'),
('grant','prize','Africa Prize for Engineering Innovation','Royal Academy of Engineering','#1F3A93','https://raeng.org.uk/africa-prize','https://raeng.org.uk/africa-prize','£50,000 first prize','Non-dilutive · plus training',63000,'{}','{}','{}','Sub-Saharan Africa',false,false,false,'2027 round closed 8 Sep 2026 · opens yearly in July','apply','For engineers building scalable engineering solutions to local challenges. Shortlisted teams get training and mentoring.','https://raeng.org.uk/news/the-2027-africa-prize-for-engineering-innovation-calls-for-applications-across-sub-saharan-africa/','2026-11-07'),
('grant','prize','Cartier Women’s Initiative','Cartier','#B3001B','https://www.cartierwomensinitiative.com/','https://www.cartierwomensinitiative.com/regional-awards','Up to $100,000','Non-dilutive · women-led impact businesses',100000,'{}','{}','{}','Worldwide, incl. Sub-Saharan Africa',true,false,true,'2027 edition closed 16 Jun 2026','apply','Grants, coaching and visibility for women-run, for-profit impact businesses.','https://www.richemont.com/news-media/press-releases-news/cartier-women-s-initiative-celebrates-20th-anniversary-and-launches-call-for-applications-for-the-2027-edition/','2026-11-07'),
('grant','competition','Google for Startups Accelerator: Africa','Google','#4285F4','https://startup.google.com/programs/accelerator/','https://g.co/acceleratorafrica','Equity-free','Accelerator · Cloud credits and mentorship',null,'{AI}','{Series A}','{}','Africa',false,false,true,'2026 cohort applications closed 18 Mar','apply','Equity-free programme for Series A startups using AI or machine learning, with Google mentors and Cloud credits.','https://techpoint.africa/news/googles-10th-startups-accelerator-africa/','2026-11-07'),
('equity','vc','Ventures Platform','Ventures Platform','#0B3D2E','https://venturesplatform.com/','https://venturesplatform.com/','Not disclosed','Pre-seed to Series A',null,'{}','{Pre-seed,Seed,Series A}','{}','Pan-African',false,false,false,'','apply','Abuja-founded fund; closed its $84M Fund II in 2026. Early backer of Paystack and Moniepoint.','https://launchbaseafrica.com/2026/08/26/ventures-platform-secures-84m-for-second-african-tech-fund-in-test-of-institutional-appetite/','2026-11-07'),
('equity','micro_vc','Microtraction','Microtraction','#111111','https://microtraction.com/','https://microtraction.com/','Not disclosed','Pre-seed',null,'{}','{Pre-seed}','{}','Africa',false,false,false,'','apply','Pre-seed investor in African startups, investing from its Community Fund.','https://techcrunch.com/2022/08/19/microtraction-hits-15m-first-close-on-its-second-fund-for-pre-seed-investment-in-african-startups','2026-11-07'),
('equity','accelerator','Y Combinator','Y Combinator','#FF6600','https://www.ycombinator.com/','https://www.ycombinator.com/apply','$500k','Standard deal: $125k for 7% + $375k SAFE',500000,'{}','{Idea,Pre-seed,Seed}','{}','Global (Africa-based teams accepted)',false,false,false,'','apply','Three-month programme in San Francisco with a standard investment for every company.','https://www.ycombinator.com/deal','2026-11-07')
on conflict (name) do nothing;
