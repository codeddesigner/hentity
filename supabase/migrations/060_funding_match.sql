-- Funding matching, take two (founder feedback: "best fit for over 100, a lot aren't, some are closed").
-- 1. Closed rounds never count as matches. Each opportunity gets a status: open (dated, not passed),
--    rolling (no date, no closed-round note), unknown (no date, "check their site"), closed.
-- 2. Eligibility and fit are separate. Stage, country, women-founded, incorporation and a live product are
--    hard rules: failing any one makes it "Not eligible". Category is fit, not eligibility.
--    The old "founding team on file" check is gone (it's about our profile, not the funder's rules), which
--    is what made criteria-free listings score 1 of 1.
-- 3. A score (0-100) rewards specific matches over "anyone can apply": a funder that backs fintech in
--    Nigeria at seed is a better fit for a Nigerian seed fintech than an any-sector, all-Africa grant.
-- 4. Best match = open or rolling, eligible, score >= 60, and either the funder's sectors include yours
--    or your deck shares at least 3 terms with what they fund; capped at the 12 strongest. Others that
--    qualify (or score 50+) are Good fit; then Possible, Not eligible, Closed.
-- 5. Founders can add their pitch deck (or a short description). The browser reads it and saves only
--    signals the founder confirms: sectors, keywords, stage, raise, markets. The file is never uploaded.

create table if not exists public.funding_profiles (
  product_id uuid primary key references public.products(id) on delete cascade,
  sectors text[] not null default '{}',
  keywords text[] not null default '{}',
  stage text,
  raise_usd numeric check (raise_usd is null or raise_usd >= 0),
  countries text[] not null default '{}',
  women boolean,
  summary text check (summary is null or char_length(summary) <= 600),
  source text not null default 'deck' check (source in ('deck', 'text')),
  deck_name text,
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now());
alter table public.funding_profiles enable row level security;
drop policy if exists "funding profile team" on public.funding_profiles;
create policy "funding profile team" on public.funding_profiles for all
  using (public.is_maker(product_id) or public.is_admin()) with check (public.is_maker(product_id));
grant select, insert, update, delete on public.funding_profiles to authenticated;

-- Product facts now include what the deck told us
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
    'dataroom', (select coalesce(jsonb_object_agg(kind, jsonb_build_object('file', file_name, 'text', left(text_value, 140), 'version', version, 'at', updated_at)), '{}') from dataroom_items d where d.product_id = p.id),
    'deck', (select jsonb_build_object('sectors', f.sectors, 'keywords', f.keywords, 'stage', f.stage, 'raise_usd', f.raise_usd, 'countries', f.countries,
                                       'women', f.women, 'summary', f.summary, 'source', f.source, 'deck_name', f.deck_name, 'updated_at', f.updated_at)
             from funding_profiles f where f.product_id = p.id))
  from products p where p.id = pid and (public.is_maker(pid) or public.is_admin());
$$;

-- Where an opportunity stands today
create or replace function public.funding_status(o funding_opps) returns text
language sql stable set search_path = public as $$
  select case
    when o.deadline is not null then case when o.deadline >= public.lagos_today() then 'open' else 'closed' end
    when coalesce(o.round_note, '') = '' then 'rolling'
    when o.round_note ilike '%closed%' then 'closed'
    else 'unknown' end;
$$;

-- The funder's rules, checked against the product (and its deck). Each check: key, label, ok, hard,
-- unknown (we lack the fact), evidence.
create or replace function public.funding_checks(o funding_opps, fx jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare c jsonb := '[]'; cats text[]; ccs text[]; cc text := fx ->> 'country'; team text := fx ->> 'team';
  stg text := coalesce(fx ->> 'stage', fx -> 'deck' ->> 'stage'); dk jsonb := fx -> 'deck'; raise numeric := (fx -> 'deck' ->> 'raise_usd')::numeric;
  CN jsonb := '{"NG":"Nigeria","KE":"Kenya","GH":"Ghana","ZA":"South Africa","RW":"Rwanda","EG":"Egypt","MA":"Morocco","SN":"Senegal","ET":"Ethiopia","UG":"Uganda","TZ":"Tanzania","CI":"Côte d’Ivoire","CM":"Cameroon","TN":"Tunisia","DZ":"Algeria","BJ":"Benin","TG":"Togo","ZM":"Zambia","ZW":"Zimbabwe"}';
begin
  select coalesce(array_agg(distinct x), '{}') into cats from (select jsonb_array_elements_text(fx -> 'categories') x
    union select jsonb_array_elements_text(coalesce(dk -> 'sectors', '[]'))) s;
  select coalesce(array_agg(distinct x), '{}') into ccs from (select cc x where cc is not null
    union select jsonb_array_elements_text(coalesce(dk -> 'countries', '[]'))) s;
  if cardinality(o.categories) > 0 then
    c := c || jsonb_build_object('key', 'category', 'hard', false, 'unknown', cardinality(cats) = 0,
      'label', array_to_string(o.categories, ', ') || (case when cardinality(o.categories) = 1 then ' startups' else '' end),
      'ok', cats && o.categories, 'evidence', coalesce(nullif(array_to_string(cats, ', '), ''), 'No category set'));
  end if;
  if cardinality(o.stages) > 0 then
    c := c || jsonb_build_object('key', 'stage', 'hard', true, 'unknown', stg is null, 'label', array_to_string(o.stages, ' or '),
      'ok', stg = any(o.stages), 'evidence', coalesce(stg || case when fx ->> 'stage' is null then ' (from your deck)' else '' end, 'Stage not set'));
  end if;
  if cardinality(o.countries) > 0 then
    c := c || jsonb_build_object('key', 'country', 'hard', true, 'unknown', cardinality(ccs) = 0,
      'label', 'Operating in ' || coalesce(nullif(o.region_label, ''), array_to_string(o.countries, ', ')),
      'ok', ccs && o.countries, 'evidence', coalesce(nullif((select string_agg(coalesce(CN ->> x, x), ', ') from unnest(ccs) x), ''), 'Country not set'));
  end if;
  if o.women_only then
    c := c || jsonb_build_object('key', 'women', 'hard', true, 'unknown', (team is null or team = 'unstated') and (dk ->> 'women') is null,
      'label', 'Women-founded or mixed team',
      'ok', team in ('women','mixed') or ((team is null or team = 'unstated') and (dk ->> 'women')::boolean),
      'evidence', case team when 'women' then 'Women-founded' when 'mixed' then 'Mixed team' when 'men' then 'Men-founded'
        else case when (dk ->> 'women')::boolean then 'Woman founder (from your deck)' else 'Founding team not set' end end);
  end if;
  if o.needs_incorporation then
    c := c || jsonb_build_object('key', 'incorporated', 'hard', true, 'unknown', fx ->> 'incorporated' is null, 'label', 'Incorporated in Africa',
      'ok', fx ->> 'incorporated' is not null,
      'evidence', case when fx ->> 'incorporated' is not null then coalesce(CN ->> cc, cc, '') || coalesce(', ' || (fx ->> 'founded_year'), '') else 'Add your registration number' end);
  end if;
  if o.needs_live then
    c := c || jsonb_build_object('key', 'live', 'hard', true, 'unknown', false, 'label', 'Working product with users', 'ok', (fx ->> 'live')::boolean,
      'evidence', case when (fx ->> 'live')::boolean then 'Live on Hentity' || case when (fx ->> 'testers')::int > 0 then ' · ' || (fx ->> 'testers') || ' testers' else '' end else 'Not live yet' end);
  end if;
  -- Investors: is the cheque in the range of what you're raising?
  if o.mode = 'equity' and raise > 0 and o.amount_usd > 0 then
    c := c || jsonb_build_object('key', 'cheque', 'hard', false, 'unknown', false, 'label', 'Cheque ' || coalesce(nullif(o.amount_text, ''), '$' || o.amount_usd::bigint),
      'ok', o.amount_usd between raise * 0.05 and raise * 2.5, 'evidence', 'Raising $' || case when raise >= 1e6 then round(raise / 1e6, 1) || 'M' else round(raise / 1e3) || 'k' end);
  end if;
  return c;
end $$;

-- Fit for one opportunity: status, eligibility, score, reasons
create or replace function public.funding_fit(o funding_opps, fx jsonb, ch jsonb) returns jsonb
language plpgsql stable set search_path = public as $$
declare st text := public.funding_status(o); eligible boolean; miss text; score int := 0; kw int := 0; terms text[]; txt text;
  cat jsonb; stg jsonb; ctry jsonb; wom jsonb; chq jsonb; why text[] := '{}'; best boolean;
begin
  select e into cat from jsonb_array_elements(ch) e where e ->> 'key' = 'category';
  select e into stg from jsonb_array_elements(ch) e where e ->> 'key' = 'stage';
  select e into ctry from jsonb_array_elements(ch) e where e ->> 'key' = 'country';
  select e into wom from jsonb_array_elements(ch) e where e ->> 'key' = 'women';
  select e into chq from jsonb_array_elements(ch) e where e ->> 'key' = 'cheque';
  select e ->> 'label' into miss from jsonb_array_elements(ch) e
    where (e ->> 'hard')::boolean and not (e ->> 'ok')::boolean and not coalesce((e ->> 'unknown')::boolean, false) limit 1;
  eligible := miss is null;
  -- Sector: the strongest signal
  if cat is null then score := score + 15;
  -- your main category scores more than a side one
  elsif (cat ->> 'ok')::boolean then score := score + case when coalesce(fx -> 'categories' ->> 0, fx -> 'deck' -> 'sectors' ->> 0) = any(o.categories) then 40 else 28 end; why := why || (select string_agg(x, ', ') from (select x from unnest(o.categories) x
      where x in (select jsonb_array_elements_text(fx -> 'categories') union select jsonb_array_elements_text(coalesce(fx -> 'deck' -> 'sectors', '[]')))) s);
  end if;
  if stg is null then score := score + 8; elsif (stg ->> 'ok')::boolean then score := score + 20; why := why || (stg ->> 'evidence'); end if;
  if ctry is null then score := score + 8; elsif (ctry ->> 'ok')::boolean then score := score + 20; why := why || coalesce(nullif(o.region_label, ''), 'Your country'); end if;
  if wom is not null and (wom ->> 'ok')::boolean then score := score + 10; why := why || 'Women-founded'::text; end if;
  if chq is not null and (chq ->> 'ok')::boolean then score := score + 8; why := why || ('Cheque fits your raise'); end if;
  -- Deck keywords found in what the funder says they back
  select coalesce(array_agg(x), '{}') into terms from (select jsonb_array_elements_text(coalesce(fx -> 'deck' -> 'keywords', '[]')) x limit 30) s;
  if cardinality(terms) > 0 then
    txt := lower(coalesce(o.name, '') || ' ' || coalesce(o.description, '') || ' ' || coalesce(o.judging::text, '') || ' ' || coalesce(o.how, '') || ' ' || array_to_string(o.categories, ' '));
    select count(*) into kw from unnest(terms) t where length(t) >= 3 and txt ~ ('\m' || regexp_replace(lower(t), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M');
    score := score + least(kw * 6, 24);
    if kw > 0 then why := why || (kw || ' term' || case when kw = 1 then '' else 's' end || ' from your deck'); end if;
  end if;
  score := least(score, 100);
  if not eligible then score := least(score, 25); end if;
  best := st in ('open', 'rolling') and eligible and score >= 60 and (coalesce((cat ->> 'ok')::boolean, false) or kw >= 3);
  return jsonb_build_object('status', st, 'eligible', eligible, 'miss', miss, 'score', score, 'best', best, 'why', to_jsonb(why), 'kw', kw);
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
    'counts', (select jsonb_build_object('grant', count(*) filter (where mode = 'grant'), 'equity', count(*) filter (where mode = 'equity'))
               from funding_opps o where active and public.funding_status(o) <> 'closed'),
    -- Best match is the 12 strongest qualifying fits; the rest that qualify, or come close, are Good fit
    'opps', (select coalesce(jsonb_agg(x || jsonb_build_object('best', tier = 'best', 'tier', tier)
                order by array_position(array['best','good','possible','ineligible','closed'], tier), (x ->> 'score')::int desc, x ->> 'deadline' nulls last), '[]')
      from (select x, case when x ->> 'status' = 'closed' then 'closed' when not (x ->> 'eligible')::boolean then 'ineligible'
                           when (x ->> 'best')::boolean and rn <= 12 then 'best'
                           when (x ->> 'best')::boolean or ((x ->> 'score')::int >= 50 and x ->> 'status' <> 'unknown') then 'good' else 'possible' end tier
        from (select x, row_number() over (order by (x ->> 'best')::boolean desc, (x ->> 'score')::int desc, x ->> 'deadline' nulls last) rn from (
          select to_jsonb(o) - 'portfolio' || jsonb_build_object(
            'checks', ch, 'total', (select count(*) from jsonb_array_elements(ch) e where not coalesce((e ->> 'unknown')::boolean, false)),
            'meets', (select count(*) from jsonb_array_elements(ch) e where (e ->> 'ok')::boolean),
            'track', (select jsonb_build_object('status', t.status, 'remind', t.remind) from funding_track t where t.opp_id = o.id and t.user_id = auth.uid())) || public.funding_fit(o, fx, ch) x
          from funding_opps o, lateral (select public.funding_checks(o, fx) ch) k
          where o.active and o.mode = md and (o.deadline is null or o.deadline >= public.lagos_today())) a) b) c),
    'tracked', (select coalesce(jsonb_agg(jsonb_build_object('opp_id', o.id, 'name', o.name, 'mode', o.mode, 'status', t.status, 'deadline', o.deadline, 'round_note', o.round_note,
                  'closed', o.deadline < public.lagos_today()) order by (t.status = 'saved') desc, o.deadline nulls last, t.updated_at desc), '[]')
             from funding_track t join funding_opps o on o.id = t.opp_id where t.user_id = auth.uid() and o.mode = md));
end $$;

create or replace function public.funding_opp(oid uuid, pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o funding_opps; fx jsonb; ch jsonb;
begin
  select * into o from funding_opps where id = oid and (active or public.is_admin());
  if o.id is null then raise exception 'This opportunity is no longer listed' using errcode = 'P0001'; end if;
  fx := public.funding_facts(pid);
  if fx is null then raise exception 'Pick one of your products' using errcode = 'P0001'; end if;
  ch := public.funding_checks(o, fx);
  return to_jsonb(o) - 'portfolio' || jsonb_build_object('product', fx, 'checks', ch,
    'total', (select count(*) from jsonb_array_elements(ch) e where not coalesce((e ->> 'unknown')::boolean, false)),
    'meets', (select count(*) from jsonb_array_elements(ch) e where (e ->> 'ok')::boolean),
    'track', (select jsonb_build_object('status', t.status, 'remind', t.remind, 'applied_at', t.applied_at) from funding_track t where t.opp_id = o.id and t.user_id = auth.uid()))
    || (select f || jsonb_build_object('tier', case when f ->> 'status' = 'closed' then 'closed' when not (f ->> 'eligible')::boolean then 'ineligible'
                                                   when (f ->> 'best')::boolean or ((f ->> 'score')::int >= 50 and f ->> 'status' <> 'unknown') then 'good' else 'possible' end)
        from (select public.funding_fit(o, fx, ch) f) z);
end $$;
