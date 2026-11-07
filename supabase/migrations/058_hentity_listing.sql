-- Hentity on Hentity (Figma 238:4196): Hentity is listed as a product in its own directory, and reviews of
-- Hentity live on that page. Reviews gain an optional feature tag (score per feature) and can be anonymous.
-- "Me too" on the Hentity page uses the same votes as Helpful. The side column lists the most-requested
-- features (members vote) and what shipped.

-- ---------------------------------------------------------------- reviews: feature tag, anonymous
alter table public.product_reviews add column if not exists feature text check (feature is null or feature in ('launches','find','funding','insights','chats','betas','validate','directory'));
alter table public.product_reviews add column if not exists anonymous boolean not null default false;

create or replace function public.product_reviews(pid uuid, sort text default 'helpful', lim int default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (select * from product_reviews where product_id = pid and not hidden)
  select jsonb_build_object(
    'count', (select count(*) from r),
    'avg', (select round(avg(rating)::numeric, 1) from r),
    'dist', (select jsonb_object_agg(s, (select count(*) from r where rating = s)) from generate_series(1, 5) s),
    'recommend', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where rating >= 4) / count(*)) end from r),
    'week', (select count(*) from r where created_at > now() - interval '7 days'),
    'replies_month', (select count(*) from r where maker_reply_at > now() - interval '30 days'),
    'by_feature', (select coalesce(jsonb_agg(jsonb_build_object('feature', feature, 'avg', a, 'n', n) order by n desc, a desc), '[]'::jsonb)
                   from (select feature, round(avg(rating)::numeric, 1) a, count(*) n from r where feature is not null group by feature) f),
    'can_review', auth.uid() is not null and not public.is_maker(pid),
    'is_maker', auth.uid() is not null and public.is_maker(pid),
    'reviews', coalesce((select jsonb_agg(x.j order by x.k1 desc, x.k2 desc) from (
      select case sort when 'newest' then extract(epoch from rv.created_at) when 'high' then rv.rating * 1e12 + extract(epoch from rv.created_at) when 'low' then (6 - rv.rating) * 1e12 + extract(epoch from rv.created_at) else rv.helpful_count end as k1,
             extract(epoch from rv.created_at) as k2,
        jsonb_build_object('id', rv.id, 'rating', rv.rating, 'body', rv.body, 'feature', rv.feature, 'anonymous', rv.anonymous, 'helpful', rv.helpful_count,
          'created_at', rv.created_at, 'edited_at', rv.edited_at,
          'mine', rv.user_id = auth.uid(), 'voted', exists (select 1 from product_review_votes v where v.review_id = rv.id and v.user_id = auth.uid()),
          'tester', exists (select 1 from beta_applications a join betas b on b.id = a.beta_id where b.product_id = pid and a.user_id = rv.user_id and a.status = 'accepted'),
          -- an anonymous review shows only the city, unless it's your own
          'user', case when rv.anonymous and rv.user_id is distinct from auth.uid() and not public.is_admin()
            then jsonb_build_object('name', 'Anonymous', 'city', u.city, 'anonymous', true)
            else jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'headline', u.headline, 'city', u.city, 'is_verified', u.is_verified) end,
          'reply', case when rv.maker_reply is null then null else jsonb_build_object('body', rv.maker_reply, 'at', rv.maker_reply_at,
            'by', (select jsonb_build_object('name', mu.name, 'username', mu.username, 'avatar_url', mu.avatar_url, 'avatar_color', mu.avatar_color) from profiles mu where mu.id = rv.maker_reply_by)) end) as j
      from product_reviews rv join profiles u on u.id = rv.user_id
      where rv.product_id = pid and (not rv.hidden or rv.user_id = auth.uid()) and not u.banned
      order by 1 desc, 2 desc limit least(lim, 200)) x), '[]'::jsonb));
$$;
grant execute on function public.product_reviews(uuid, text, int) to anon, authenticated;

-- ---------------------------------------------------------------- roadmap: most requested and shipped
create table if not exists public.roadmap_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  status text not null default 'requested' check (status in ('requested', 'shipped')),
  shipped_at date,
  votes int not null default 0,
  created_at timestamptz not null default now());
create index if not exists roadmap_items_product on public.roadmap_items(product_id, status);
create table if not exists public.roadmap_votes (
  item_id uuid not null references public.roadmap_items(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id));
alter table public.roadmap_items enable row level security;
alter table public.roadmap_votes enable row level security;
drop policy if exists "roadmap read" on public.roadmap_items;
create policy "roadmap read" on public.roadmap_items for select using (true);
drop policy if exists "roadmap admin" on public.roadmap_items;
create policy "roadmap admin" on public.roadmap_items for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "roadmap votes read" on public.roadmap_votes;
create policy "roadmap votes read" on public.roadmap_votes for select using (user_id = auth.uid());
drop policy if exists "roadmap votes own" on public.roadmap_votes;
create policy "roadmap votes own" on public.roadmap_votes for insert with check (user_id = auth.uid() and exists (select 1 from roadmap_items i where i.id = item_id and i.status = 'requested'));
drop policy if exists "roadmap votes delete own" on public.roadmap_votes;
create policy "roadmap votes delete own" on public.roadmap_votes for delete using (user_id = auth.uid());
grant select on public.roadmap_items to anon, authenticated;
grant insert, update, delete on public.roadmap_items to authenticated;
grant select, insert, delete on public.roadmap_votes to authenticated;

create or replace function public.roadmap_vote_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update roadmap_items set votes = (select count(*) from roadmap_votes where item_id = coalesce(new.item_id, old.item_id)) where id = coalesce(new.item_id, old.item_id);
  return null;
end $$;
drop trigger if exists roadmap_vote_sync on public.roadmap_votes;
create trigger roadmap_vote_sync after insert or delete on public.roadmap_votes for each row execute function public.roadmap_vote_sync();

create or replace function public.roadmap(pid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'requested', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'votes', i.votes,
        'voted', exists (select 1 from roadmap_votes v where v.item_id = i.id and v.user_id = auth.uid())) order by i.votes desc, i.created_at)
      from (select * from roadmap_items where product_id = pid and status = 'requested' order by votes desc, created_at limit 6) i), '[]'::jsonb),
    'shipped', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'at', i.shipped_at) order by i.shipped_at desc nulls last, i.created_at desc)
      from (select * from roadmap_items where product_id = pid and status = 'shipped' order by shipped_at desc nulls last, created_at desc limit 6) i), '[]'::jsonb));
$$;
grant execute on function public.roadmap(uuid) to anon, authenticated;

-- ---------------------------------------------------------------- Hentity's own listing
-- Live in the Directory (no launch week, so never on the weekly board). Unverified until an admin adds the
-- company registration number and ticks Verified. Owned by the admin account so the
-- team can reply to reviews; the page shows no founders, makers or company.
insert into public.products (slug, name, tagline, description, website, color, logo_url, categories, country, city, countries,
  currencies, languages, platforms, stage, owner_id, status, verified, claimed_at, reviewed_at)
select 'hentity', 'Hentity', 'Where African startups launch, get found and grow',
  'Hentity’s own listing. Reviews here go straight to the team, and we reply to every one.',
  'https://hentity.com', '#000000', 'https://hentity.com/icon-512.png', array['SaaS'], 'NG', 'Lagos', '{}',
  'All African currencies', 'English', 'Web · installable app on iOS and Android', 'Pre-seed',
  (select id from profiles where email = 'encircode@gmail.com' limit 1), 'live', false, now(), now()
where not exists (select 1 from public.products where slug = 'hentity');

-- What already shipped (dates from the release history)
insert into public.roadmap_items (product_id, title, status, shipped_at)
select p.id, t.title, 'shipped', t.d::date from public.products p,
  (values ('Reviews on every product page', '2026-11-07'), ('Install Hentity as an app', '2026-11-07'), ('Saved page', '2026-11-07'),
          ('Proptech category', '2026-11-07'), ('Funding: grants and investors', '2026-11-07'), ('Find: co-founders and roles', '2026-11-06')) t(title, d)
where p.slug = 'hentity' and not exists (select 1 from public.roadmap_items r where r.product_id = p.id);

-- Every admin is on the Hentity team: they reply to reviews of Hentity (and don't review it themselves)
insert into public.product_makers (product_id, user_id, role, accepted)
select p.id, u.id, 'Team', true from public.products p, public.profiles u
where p.slug = 'hentity' and u.role = 'admin' and u.id is distinct from p.owner_id
on conflict do nothing;
