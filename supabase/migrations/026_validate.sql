-- Validate an idea (Figma: Validate). Checks an idea against every startup on Hentity (launched and unclaimed)
-- and returns a novelty score, closest matches and where the space is crowded. Ideas are private to their author
-- unless they choose to share the report link.

create table if not exists public.idea_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idea text not null check (char_length(idea) between 10 and 600),
  who text, country text, city text, money text, stage text,
  categories text[] not null default '{}',
  result jsonb not null default '{}'::jsonb,
  score int,
  tests jsonb not null default '{}'::jsonb,   -- which "test these first" items are ticked
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idea_checks_user_idx on public.idea_checks (user_id, created_at desc);
alter table public.idea_checks enable row level security;
drop policy if exists "ideas own" on public.idea_checks;
create policy "ideas own" on public.idea_checks for select using (user_id = auth.uid() or shared or public.is_admin());
drop policy if exists "ideas own write" on public.idea_checks;
create policy "ideas own write" on public.idea_checks for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "ideas own delete" on public.idea_checks;
create policy "ideas own delete" on public.idea_checks for delete using (user_id = auth.uid());

-- Meaningful words of an idea (English stems), minus words every product description uses
create or replace function public.idea_words(t text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(lexeme), '{}') from unnest(to_tsvector('english', coalesce(t, '')))
  where length(lexeme) > 2 and lexeme <> all (array['platform','app','applic','servic','busi','help','make','use','send','turn','week','month','day','peopl',
    'onlin','mobil','digit','simpl','easi','get','way','new','one','also','will','want','can','user','custom','compani','small','product','manag','system',
    'tool','solut','base','provid','offer','let','connect','match','build','creat','find','time','work','like','need','africa','african','nigeria','kenya',
    'ghana','lago','nairobi','accra','smart','fast','better','best','everi','across','via','through','power','owner','start','startup','grow','run']);
$$;

create or replace function public.validate_idea(idea text, who text, cc text, city text, money text, stage text, cats text[])
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare lx text[]; wx text[]; res jsonb; sc int; nid uuid; recent int;
  n_sim int; n_cust int; n_mkt int; n_city int; top int; n_unc int; n_live int; fol int;
  p_lvl text; c_lvl text; a_lvl text; m_lvl text; pts int;
begin
  if auth.uid() is null then raise exception 'Sign in to validate an idea' using errcode = 'P0001'; end if;
  idea := trim(coalesce(idea, ''));
  if char_length(idea) < 20 then raise exception 'Describe your idea in a sentence or two' using errcode = 'P0001'; end if;
  select count(*) into recent from idea_checks where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'You''ve run a lot of checks. Try again in an hour.' using errcode = 'P0001'; end if;
  lx := idea_words(idea); wx := idea_words(who);
  cats := coalesce(cats, '{}');

  create temp table if not exists _m (id uuid, slug text, name text, tagline text, city text, country text, status text, categories text[], color text, logo_url text, followers int, upvotes int, sim int, cust boolean, shared text[]) on commit drop;
  truncate _m;
  insert into _m
  select p.id, p.slug, p.name, p.tagline, p.city, p.country, p.status, p.categories, p.color, p.logo_url, p.follower_count, p.upvote_count,
    least(99, round(
      65 * least(1, kw.n::numeric / greatest(1, least(4, cardinality(lx))))   -- share of the idea's key words in what they do
      + 20 * (case when p.categories && cats then 1 else 0 end)                 -- same industry
      + 15 * least(1, word_similarity(lower(idea), lower(p.tagline || ' ' || coalesce(p.description, '')))))
    )::int,
    coalesce(cardinality(wx) > 0 and exists (select 1 from unnest(wx) w where v.doc @@ to_tsquery('english', quote_literal(w))), false),
    kw.words
  from products p
  cross join lateral (select to_tsvector('english', p.name || ' ' || p.tagline || ' ' || coalesce(p.description, '')) as doc) v
  cross join lateral (select count(*) n, coalesce(array_agg(w), '{}') words from unnest(lx) w where v.doc @@ to_tsquery('english', quote_literal(w))) kw
  where p.status in ('live', 'scheduled', 'unclaimed') and p.owner_id is distinct from auth.uid();
  delete from _m where sim < 36;

  select count(*), count(*) filter (where cust), count(*) filter (where cc is null or cc = '' or country = cc),
         count(*) filter (where coalesce(validate_idea.city, '') <> '' and lower(_m.city) = lower(validate_idea.city)), coalesce(max(sim), 0),
         count(*) filter (where status = 'unclaimed'), count(*) filter (where status <> 'unclaimed'), coalesce(sum(followers), 0)
    into n_sim, n_cust, n_mkt, n_city, top, n_unc, n_live, fol from _m;

  p_lvl := case when n_sim >= 5 then 'crowded' when n_sim >= 1 then 'some' else 'open' end;
  c_lvl := case when n_cust >= 3 then 'crowded' when n_cust >= 1 then 'some' else 'open' end;
  a_lvl := case when top >= 75 then 'crowded' when top >= 55 then 'some' else 'open' end;
  m_lvl := case when n_mkt >= 4 then 'crowded' when n_mkt >= 1 then 'some' else 'open' end;
  pts := (case p_lvl when 'crowded' then 30 when 'some' then 15 else 0 end) + (case c_lvl when 'crowded' then 15 when 'some' then 7 else 0 end)
       + (case a_lvl when 'crowded' then 35 when 'some' then 18 else 0 end) + (case m_lvl when 'crowded' then 20 when 'some' then 10 else 0 end);
  sc := greatest(5, 100 - pts);

  res := jsonb_build_object(
    'score', sc,
    'levels', jsonb_build_object('problem', p_lvl, 'customer', c_lvl, 'approach', a_lvl, 'market', m_lvl),
    'counts', jsonb_build_object('similar', n_sim, 'customer', n_cust, 'market', n_mkt, 'city', n_city, 'top', top, 'unclaimed', n_unc, 'live', n_live, 'followers', fol,
      'checked', (select count(*) from products where status in ('live','scheduled','unclaimed'))),
    'matches', (select coalesce(jsonb_agg(to_jsonb(m) - 'cust' order by m.sim desc, m.followers desc), '[]'::jsonb) from (select * from _m order by sim desc, followers desc limit 8) m),
    'cities', (select coalesce(jsonb_agg(jsonb_build_object('city', c, 'cc', k, 'n', n) order by n desc, c), '[]'::jsonb)
               from (select coalesce(nullif(_m.city, ''), 'Unknown') c, _m.country k, count(*) n from _m group by 1, 2 order by 3 desc limit 6) x),
    'words', to_jsonb(lx)
  );
  insert into idea_checks (user_id, idea, who, country, city, money, stage, categories, result, score)
  values (auth.uid(), left(idea, 600), left(who, 120), cc, left(city, 80), money, stage, cats, res, sc) returning id into nid;
  return jsonb_build_object('id', nid, 'score', sc);
end $$;

grant select, update, delete on public.idea_checks to authenticated;
grant select on public.idea_checks to anon;
grant execute on function public.validate_idea(text, text, text, text, text, text, text[]) to authenticated;
