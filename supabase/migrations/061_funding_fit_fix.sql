-- 060 follow-up: appending a plain string to the reasons array ("Cheque fits your raise") was read as an
-- array literal and failed once a founder saved a deck with their raise. Append with array_append instead.

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
  elsif (cat ->> 'ok')::boolean then score := score + case when coalesce(fx -> 'categories' ->> 0, fx -> 'deck' -> 'sectors' ->> 0) = any(o.categories) then 40 else 28 end; why := array_append(why, (select string_agg(x, ', ') from (select x from unnest(o.categories) x
      where x in (select jsonb_array_elements_text(fx -> 'categories') union select jsonb_array_elements_text(coalesce(fx -> 'deck' -> 'sectors', '[]')))) s));
  end if;
  if stg is null then score := score + 8; elsif (stg ->> 'ok')::boolean then score := score + 20; why := array_append(why, stg ->> 'evidence'); end if;
  if ctry is null then score := score + 8; elsif (ctry ->> 'ok')::boolean then score := score + 20; why := array_append(why, coalesce(nullif(o.region_label, ''), 'Your country')); end if;
  if wom is not null and (wom ->> 'ok')::boolean then score := score + 10; why := array_append(why, 'Women-founded'::text); end if;
  if chq is not null and (chq ->> 'ok')::boolean then score := score + 8; why := array_append(why, 'Cheque fits your raise'::text); end if;
  -- Deck keywords found in what the funder says they back
  select coalesce(array_agg(x), '{}') into terms from (select jsonb_array_elements_text(coalesce(fx -> 'deck' -> 'keywords', '[]')) x limit 30) s;
  if cardinality(terms) > 0 then
    txt := lower(coalesce(o.name, '') || ' ' || coalesce(o.description, '') || ' ' || coalesce(o.judging::text, '') || ' ' || coalesce(o.how, '') || ' ' || array_to_string(o.categories, ' '));
    select count(*) into kw from unnest(terms) t where length(t) >= 3 and txt ~ ('\m' || regexp_replace(lower(t), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M');
    score := score + least(kw * 6, 24);
    if kw > 0 then why := array_append(why, (kw || ' term' || case when kw = 1 then '' else 's' end || ' from your deck')::text); end if;
  end if;
  why := array_remove(why, null);
  score := least(score, 100);
  if not eligible then score := least(score, 25); end if;
  best := st in ('open', 'rolling') and eligible and score >= 60 and (coalesce((cat ->> 'ok')::boolean, false) or kw >= 3);
  return jsonb_build_object('status', st, 'eligible', eligible, 'miss', miss, 'score', score, 'best', best, 'why', to_jsonb(why), 'kw', kw);
end $$;
