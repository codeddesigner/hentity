-- Alternatives on product pages, ranked by how close they really are (was: any product sharing one category,
-- in no particular order). Each candidate is scored 0-100 from:
--   tags (categories)  45: weighted overlap of the two tag sets 35 (broad tags like SaaS, Apps and
--                          Productivity count 0.4), plus 10 when the main tag is the same (4 if it's a broad one)
--   description        45: what-we-do words in common 35, plus how alike the taglines read 10.
--                          Words are anchored on taglines (the one line that says what a product does): a word
--                          counts when it's in one tagline and anywhere in the other's tagline or description.
--                          Rarer words weigh more (a shared "rent" says more than a shared "payments"), and
--                          filler like "built", "next", "everything" never counts.
--   same country        5, same stage 5
-- A candidate needs a shared tag or a shared word, and 25+ to show. The page shows the score, the shared tags
-- and the shared words, so people can see why each one is listed.

create or replace function public.product_alternatives(pid uuid, lim int default 4) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare p products; mw text[]; mt text[];
  broad text[] := array['SaaS', 'Apps', 'Productivity'];
  filler text[] := array['everyth','give','real','right','next','live','built','still','differ','someth','anoth','follow','without','miss',
    'direct','link','bring','idea','life','move','current','countri','bought','goe','founder','problem','question','everyon','alreadi','first',
    'billion','million','thousand','today','world','global','local','lead','top','team','help','allow','enabl','access','instant','seamless',
    'trust','secur','afford','modern','power','place','thing','experi','level','part','whole','mani','much','well','even','realli','actual','just','less','layer','easili','fix','simplifi'];
begin
  select * into p from products where id = pid;
  if p.id is null then return '[]'; end if;
  mw := array(select w from unnest(public.idea_words(coalesce(p.tagline, '') || ' ' || coalesce(p.description, ''))) w where w <> all(filler) and w <> lower(p.name));
  mt := array(select w from unnest(public.idea_words(coalesce(p.tagline, ''))) w where w <> all(filler) and w <> lower(p.name));
  return coalesce((
    with docs as (
      select c.id, c.slug, c.name, c.tagline, c.description, c.logo_url, c.color, c.country, c.status, c.stage, c.upvote_count, c.categories,
        array(select w from unnest(public.idea_words(coalesce(c.tagline, '') || ' ' || coalesce(c.description, ''))) w where w <> all(filler) and w <> lower(c.name)) dw,
        array(select w from unnest(public.idea_words(coalesce(c.tagline, ''))) w where w <> all(filler) and w <> lower(c.name)) dwt
      from products c where c.status in ('live', 'scheduled', 'unclaimed') and c.slug <> 'hentity'),
    tot as (select count(*)::numeric n from docs),
    df as (select u.x as w, ln((tot.n + 1) / (count(*) + 1)) idf from docs, unnest(docs.dw) u(x), tot group by u.x, tot.n),
    den as (select greatest(1.5, coalesce(sum(coalesce(df.idf, 3)), 0)) v from unnest(mt) m(x) left join df on df.w = m.x),
    cand as (
      select d.*,
        array(select t from unnest(d.categories) t where t = any(p.categories)) shared_tags,
        array(select distinct x from unnest(d.dw) x where x = any(mt) or (x = any(d.dwt) and x = any(mw))) shared_words
      from docs d where d.id <> p.id),
    scored as (
      select c.*,
        least(100, round(
            35 * (select coalesce(sum(case when t = any(broad) then 0.4 else 1 end) filter (where t = any(c.shared_tags)), 0)
                         / greatest(1, sum(case when t = any(broad) then 0.4 else 1 end))
                  from (select distinct t from unnest(c.categories || p.categories) t) u)
          + case when c.categories[1] is not null and c.categories[1] = p.categories[1] then case when p.categories[1] = any(broad) then 4 else 10 end else 0 end
          + 35 * least(1, (select coalesce(sum(coalesce(df.idf, 3) * case when x = any(mt) and x = any(c.dwt) then 1.5 else 1 end), 0)
                           from unnest(c.shared_words) x left join df on df.w = x) / (select v from den))
          + 10 * word_similarity(lower(coalesce(p.tagline, '')), lower(coalesce(c.tagline, '')))
          + case when c.country is not null and c.country = p.country then 5 else 0 end
          + case when c.stage is not null and c.stage = p.stage then 5 else 0 end))::int score
      from cand c
      where cardinality(c.shared_tags) > 0 or cardinality(c.shared_words) > 0)
    select jsonb_agg(jsonb_build_object('slug', s.slug, 'name', s.name, 'tagline', s.tagline, 'logo_url', s.logo_url, 'color', s.color,
        'country', s.country, 'status', s.status, 'upvote_count', s.upvote_count, 'categories', s.categories, 'tags', s.shared_tags, 'score', s.score,
        -- show real words, not stems: words from their text whose stem is shared, tagline words first
        'words', coalesce(array(select wd from (select distinct on (st) wd, st, pos from (
              select wd, pos, (select lexeme from unnest(to_tsvector('english', wd)) limit 1) st
              from regexp_split_to_table(lower(coalesce(s.tagline, '') || ' ' || coalesce(s.description, '')), '[^a-z]+') with ordinality t(wd, pos) where length(wd) > 2) z
            where st = any(s.shared_words) order by st, pos) y order by pos limit 4), '{}'))
      order by s.score desc, s.upvote_count desc)
    from (select * from scored where score >= 25 order by score desc, upvote_count desc limit least(greatest(lim, 1), 12)) s), '[]');
end $$;
grant execute on function public.product_alternatives(uuid, int) to anon, authenticated;
