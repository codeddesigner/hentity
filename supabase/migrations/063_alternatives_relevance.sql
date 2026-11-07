-- Alternatives, take two (founder feedback: "PlaDomus showed fintechs as alternatives, it doesn't make sense").
-- 062 counted every shared tag the same, so a product tagged Fintech first matched every bank and savings
-- app, and two products sharing only "money" and "home" counted as close.
-- Now both tags and words are compared the way search engines compare documents (cosine similarity,
-- weighted by rarity): sharing Proptech (a handful of startups) counts far more than sharing Fintech
-- (dozens), broad tags (SaaS, Apps, Productivity) barely count, and a candidate with many unrelated tags
-- scores lower than one that's only about the same thing.
--   score = 50 x tag similarity + 40 x word similarity (tagline words count double) + 10 x tagline likeness
-- To show at all, a product must share a specific tag (tag similarity 0.3+) or distinctive words
-- (word similarity 0.25+), and score 30+.

create or replace function public.product_alternatives(pid uuid, lim int default 4) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare p products;
  broad text[] := array['SaaS', 'Apps', 'Productivity'];
  filler text[] := array['everyth','give','real','right','next','live','built','still','differ','someth','anoth','follow','without','miss',
    'direct','link','bring','idea','life','move','current','countri','bought','goe','founder','problem','question','everyon','alreadi','first',
    'billion','million','thousand','today','world','global','local','lead','top','team','help','allow','enabl','access','instant','seamless',
    'trust','secur','afford','modern','power','place','thing','experi','level','part','whole','mani','much','well','even','realli','actual','just',
    'less','layer','easili','fix','simplifi','money','come','done','share','nigerian','kenyan','ghanaian','south','free','save','time','stay','isn','solv','togeth','opportun','minut','complex','design'];
begin
  select * into p from products where id = pid;
  if p.id is null then return '[]'; end if;
  return coalesce((
    with docs as (
      select c.id, c.slug, c.name, c.tagline, c.description, c.logo_url, c.color, c.country, c.status, c.upvote_count, coalesce(c.categories, '{}') cats,
        array(select distinct w from unnest(public.idea_words(coalesce(c.tagline, '') || ' ' || coalesce(c.description, ''))) w where w <> all(filler) and w <> lower(c.name)) dw,
        array(select distinct w from unnest(public.idea_words(coalesce(c.tagline, ''))) w where w <> all(filler) and w <> lower(c.name)) dwt
      from products c where c.status in ('live', 'scheduled', 'unclaimed') and c.slug <> 'hentity'
      union all
      select p.id, p.slug, p.name, p.tagline, p.description, p.logo_url, p.color, p.country, p.status, p.upvote_count, coalesce(p.categories, '{}'),
        array(select distinct w from unnest(public.idea_words(coalesce(p.tagline, '') || ' ' || coalesce(p.description, ''))) w where w <> all(filler) and w <> lower(p.name)),
        array(select distinct w from unnest(public.idea_words(coalesce(p.tagline, ''))) w where w <> all(filler) and w <> lower(p.name))
      where p.status not in ('live', 'scheduled', 'unclaimed') or p.slug = 'hentity'),
    tot as (select count(*)::numeric n from docs),
    -- rarity weights
    tdf as (select u.t, ln((tot.n + 1) / (count(*) + 1)) * case when u.t = any(broad) then 0.3 else 1 end tw from docs, unnest(docs.cats) u(t), tot group by u.t, tot.n),
    wdf as (select u.w, ln((tot.n + 1) / (count(*) + 1)) iw from docs, unnest(docs.dw) u(w), tot group by u.w, tot.n),
    -- each product as weighted tag and word vectors
    tv as (select d.id, u.t, tdf.tw from docs d, unnest(d.cats) u(t) join tdf on tdf.t = u.t),
    wv as (select d.id, u.w, wdf.iw * case when u.w = any(d.dwt) then 2 else 1 end ww from docs d, unnest(d.dw) u(w) join wdf on wdf.w = u.w),
    tn as (select id, sqrt(sum(tw * tw)) n from tv group by id),
    wn as (select id, sqrt(sum(ww * ww)) n from wv group by id),
    tsim as (select b.id, sum(a.tw * b.tw) / nullif(max(na.n) * max(nb.n), 0) s, array_agg(b.t order by a.tw desc) shared
             from tv a join tv b on b.t = a.t and b.id <> a.id join tn na on na.id = a.id join tn nb on nb.id = b.id where a.id = p.id group by b.id),
    wsim as (select b.id, sum(a.ww * b.ww) / nullif(max(na.n) * max(nb.n), 0) s, array_agg(b.w order by a.ww * b.ww desc) shared
             from wv a join wv b on b.w = a.w and b.id <> a.id join wn na on na.id = a.id join wn nb on nb.id = b.id where a.id = p.id group by b.id),
    scored as (
      select d.*, coalesce(t.s, 0) ts, coalesce(w.s, 0) ws, coalesce(t.shared, '{}') shared_tags, coalesce(w.shared, '{}') shared_words,
        least(100, round(50 * coalesce(t.s, 0) + 40 * least(1, coalesce(w.s, 0) * 1.6)
          + 10 * word_similarity(lower(coalesce(p.tagline, '')), lower(coalesce(d.tagline, '')))))::int score
      from docs d left join tsim t on t.id = d.id left join wsim w on w.id = d.id
      where d.id <> p.id and (coalesce(t.s, 0) >= 0.3 or coalesce(w.s, 0) >= 0.25))
    select jsonb_agg(jsonb_build_object('slug', s.slug, 'name', s.name, 'tagline', s.tagline, 'logo_url', s.logo_url, 'color', s.color,
        'country', s.country, 'status', s.status, 'upvote_count', s.upvote_count, 'categories', s.cats, 'score', s.score,
        'tags', array(select t from unnest(s.shared_tags) t where t <> all(broad) union all select t from unnest(s.shared_tags) t where t = any(broad) and not exists (select 1 from unnest(s.shared_tags) x where x <> all(broad))),
        -- real words, not stems: words from their text whose stem is shared, strongest first
        'words', coalesce(array(select wd from (select distinct on (st) wd, st, k from (
              select wd, (select lexeme from unnest(to_tsvector('english', wd)) limit 1) st
              from regexp_split_to_table(lower(coalesce(s.tagline, '') || ' ' || coalesce(s.description, '')), '[^a-z]+') wd where length(wd) > 2) z
            join lateral (select array_position(s.shared_words, z.st) k) kk on kk.k is not null order by st, length(wd)) y order by k limit 3), '{}'))
      order by s.score desc, s.upvote_count desc)
    from (select * from scored where score >= 30 order by score desc, upvote_count desc limit least(greatest(lim, 1), 12)) s), '[]');
end $$;
grant execute on function public.product_alternatives(uuid, int) to anon, authenticated;
