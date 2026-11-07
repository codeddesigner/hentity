-- Discuss (Figma Community · Discuss feed / Discuss thread / Discuss boards, 254:3602, 255:3385, 258:3537).
-- Reddit-style discussion for African products and startups: communities (h/<slug>), posts with up and down
-- votes and a flair, threaded replies, saves. Every listed product gets its own community (h/<product slug>)
-- where makers reply, pin announcements and mark posts Planned, In progress, Shipped or Fixed. Threads are
-- public pages (/d/<community>/<post>) readable without an account.
-- All writes go through the functions below, so counts, maker tags and ranking stay consistent.

-- ---------------------------------------------------------------- tables
create table if not exists public.d_communities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  title text not null,
  about text,
  color text not null default '#FF5B14',
  kind text not null default 'topic' check (kind in ('topic', 'product')),
  product_id uuid unique references public.products(id) on delete cascade,
  rank int not null default 100,                 -- order in "Communities" (topics)
  member_count int not null default 0,
  post_count int not null default 0,
  created_at timestamptz not null default now());

create table if not exists public.d_members (
  community_id uuid not null references public.d_communities(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id));

create table if not exists public.d_posts (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.d_communities(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  flair text not null default 'discussion' check (flair in ('discussion','question','review','feedback','show','megathread','bug','feature','announcement')),
  title text not null check (char_length(title) between 8 and 160),
  body text not null default '' check (char_length(body) <= 20000),
  slug text not null,
  product_id uuid references public.products(id) on delete set null,
  link_url text check (link_url is null or link_url ~* '^https?://'),
  images text[] not null default '{}' check (cardinality(images) <= 6),
  city text,
  score int not null default 0, ups int not null default 0, downs int not null default 0,
  comment_count int not null default 0,
  is_maker boolean not null default false,       -- author is on the team of the product it's about
  maker_replied boolean not null default false,
  pinned boolean not null default false,
  status text check (status is null or status in ('planned', 'in_progress', 'shipped', 'fixed')),
  hidden boolean not null default false,
  last_activity_at timestamptz not null default now(),
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (community_id, slug));
create index if not exists d_posts_comm on public.d_posts(community_id, created_at desc);
create index if not exists d_posts_new on public.d_posts(created_at desc) where not hidden;
create index if not exists d_posts_product on public.d_posts(product_id) where product_id is not null;

create table if not exists public.d_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.d_posts(id) on delete cascade,
  parent_id uuid references public.d_comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 10000),
  depth int not null default 0,
  score int not null default 0, ups int not null default 0, downs int not null default 0,
  is_maker boolean not null default false,
  deleted boolean not null default false,
  hidden boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists d_comments_post on public.d_comments(post_id, created_at);

create table if not exists public.d_votes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.d_posts(id) on delete cascade,
  comment_id uuid references public.d_comments(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  check ((post_id is null) <> (comment_id is null)));
create unique index if not exists d_votes_post on public.d_votes(user_id, post_id) where post_id is not null;
create unique index if not exists d_votes_comment on public.d_votes(user_id, comment_id) where comment_id is not null;

create table if not exists public.d_saves (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.d_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id));

-- Reading is open; every write goes through the functions (security definer) below
alter table public.d_communities enable row level security;
alter table public.d_members enable row level security;
alter table public.d_posts enable row level security;
alter table public.d_comments enable row level security;
alter table public.d_votes enable row level security;
alter table public.d_saves enable row level security;
drop policy if exists "d communities read" on public.d_communities;
create policy "d communities read" on public.d_communities for select using (true);
drop policy if exists "d communities admin" on public.d_communities;
create policy "d communities admin" on public.d_communities for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "d members own" on public.d_members;
create policy "d members own" on public.d_members for select using (user_id = auth.uid());
drop policy if exists "d posts read" on public.d_posts;
create policy "d posts read" on public.d_posts for select using (not hidden or author_id = auth.uid() or public.is_admin());
drop policy if exists "d comments read" on public.d_comments;
create policy "d comments read" on public.d_comments for select using (not hidden or author_id = auth.uid() or public.is_admin());
drop policy if exists "d votes own" on public.d_votes;
create policy "d votes own" on public.d_votes for select using (user_id = auth.uid());
drop policy if exists "d saves own" on public.d_saves;
create policy "d saves own" on public.d_saves for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.d_communities, public.d_posts, public.d_comments to anon, authenticated;
grant select on public.d_members, public.d_votes to authenticated;
grant select, insert, delete on public.d_saves to authenticated;
grant insert, update, delete on public.d_communities to authenticated;

-- Reports can now point at posts and replies
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('product', 'comment', 'message', 'user', 'article', 'review', 'd_post', 'd_comment'));

-- ---------------------------------------------------------------- communities
insert into public.d_communities (slug, title, about, color, rank) values
  ('ask-founders', 'Ask founders', 'Questions about registration, banking, hiring, fundraising and running a startup in Africa.', '#9B87FF', 10),
  ('dev-feedback', 'Feedback on what you’re building', 'Get honest feedback on what you’re building from African developers, designers and testers.', '#FF8F57', 20),
  ('show-hentity', 'Show Hentity', 'Share what you built. Demos, launches, milestones and lessons.', '#F5C518', 30),
  ('fintech-ng', 'Fintech in Nigeria', 'Payments, lending, savings and banking in Nigeria: products, regulation and what works.', '#4FA8FF', 40),
  ('lagos-tech', 'Lagos tech', 'Meetups, demo days, hiring and everything happening in Lagos tech.', '#16B888', 50),
  ('abuja-builders', 'Abuja builders', 'Founders and builders in Abuja: events, intros and questions.', '#FF85C0', 60)
on conflict (slug) do nothing;

-- One community per listed product, kept in step with the product
create or replace function public.d_product_community() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('live', 'scheduled', 'unclaimed') and new.slug <> 'hentity' and new.slug ~ '^[a-z0-9][a-z0-9-]{1,47}$' then
    insert into d_communities (slug, title, about, color, kind, product_id)
    values (new.slug, new.name, 'Official community for ' || new.name || '. Feedback, bugs, requests and questions; makers reply here.', coalesce(nullif(new.color, ''), '#111111'), 'product', new.id)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists d_product_community on public.products;
create trigger d_product_community after insert or update of status on public.products for each row execute function public.d_product_community();
insert into public.d_communities (slug, title, about, color, kind, product_id)
select p.slug, p.name, 'Official community for ' || p.name || '. Feedback, bugs, requests and questions; makers reply here.', coalesce(nullif(p.color, ''), '#111111'), 'product', p.id
from public.products p where p.status in ('live', 'scheduled', 'unclaimed') and p.slug <> 'hentity' and p.slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'
on conflict do nothing;

-- A welcome thread from the Hentity team, pinned in h/show-hentity
insert into public.d_posts (community_id, author_id, flair, title, body, slug, pinned, score, ups)
select c.id, u.id, 'discussion', 'Welcome to Discuss: ask, review, and give makers feedback',
  'Discuss is where African founders, builders and users talk about products and startups in public.' || chr(10) || chr(10) ||
  'Ask questions in h/ask-founders, get honest feedback in h/dev-feedback, and show what you built in h/show-hentity. Every product on Hentity also has its own community (h/<product>) where makers reply, and mark requests Planned, In progress, Shipped or Fixed.' || chr(10) || chr(10) ||
  'House rules: be useful, not rude. Critique products, not people. Makers, say you built it: your posts get a Maker tag. No referral spam or crypto shilling.',
  'welcome-to-discuss-ask-review-and-give-makers-feedback', true, 1, 1
from public.d_communities c, public.profiles u
where c.slug = 'show-hentity' and u.email = 'encircode@gmail.com'
  and not exists (select 1 from public.d_posts where slug = 'welcome-to-discuss-ask-review-and-give-makers-feedback');
update public.d_communities c set post_count = (select count(*) from public.d_posts where community_id = c.id and not hidden);

-- ---------------------------------------------------------------- helpers
-- The tag shown next to a name: Maker (on the product's team), Developer or Designer (from their headline), Tester (accepted on a beta)
create or replace function public.d_tag(uid uuid, pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when pid is not null and (exists (select 1 from products where id = pid and owner_id = uid) or exists (select 1 from product_makers where product_id = pid and user_id = uid and accepted)) then 'maker'
    when (select coalesce(headline, '') from profiles where id = uid) ~* '(developer|engineer|\mdev\M|programmer|backend|frontend|full.?stack|software)' then 'developer'
    when (select coalesce(headline, '') from profiles where id = uid) ~* '(designer|\mux\M|\mui\M|product design)' then 'designer'
    when exists (select 1 from beta_applications where user_id = uid and status = 'accepted') then 'tester'
    else null end;
$$;

create or replace function public.d_slugify(t text) returns text language sql immutable as $$
  select coalesce(nullif(trim(both '-' from left(regexp_replace(lower(t), '[^a-z0-9]+', '-', 'g'), 80)), ''), 'post');
$$;

create or replace function public.d_author(u profiles, pid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'tag', public.d_tag(u.id, pid));
$$;

-- One post as the feed and the thread show it
create or replace function public.d_post_json(p d_posts, full_body boolean default false) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title, 'flair', p.flair, 'status', p.status, 'pinned', p.pinned,
    'body', case when full_body then p.body else left(regexp_replace(p.body, '\s+', ' ', 'g'), 280) end,
    'images', p.images, 'link_url', p.link_url, 'city', p.city,
    'score', p.score, 'comment_count', p.comment_count, 'maker_replied', p.maker_replied, 'is_maker', p.is_maker,
    'created_at', p.created_at, 'edited_at', p.edited_at, 'last_activity_at', p.last_activity_at,
    'community', (select jsonb_build_object('slug', c.slug, 'title', c.title, 'color', c.color, 'kind', c.kind, 'product_id', c.product_id) from d_communities c where c.id = p.community_id),
    'author', (select public.d_author(u, coalesce(p.product_id, (select product_id from d_communities where id = p.community_id))) from profiles u where u.id = p.author_id),
    'product', (select jsonb_build_object('slug', x.slug, 'name', x.name, 'logo_url', x.logo_url, 'color', x.color, 'tagline', x.tagline, 'categories', x.categories, 'city', x.city)
                from products x where x.id = coalesce(p.product_id, (select product_id from d_communities where id = p.community_id and full_body))),
    'my_vote', coalesce((select value from d_votes v where v.post_id = p.id and v.user_id = auth.uid()), 0),
    'saved', exists (select 1 from d_saves s where s.post_id = p.id and s.user_id = auth.uid()),
    'mine', p.author_id = auth.uid());
$$;

-- ---------------------------------------------------------------- reading
-- Feed: sort hot | new | top | rising; optional community, flair, city, period (day, week, month, year, all)
create or replace function public.d_feed(sort text default 'hot', comm text default null, flair text default null, city text default null,
  period text default 'all', lim int default 25, off int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cid uuid; since timestamptz;
begin
  if comm is not null then select id into cid from d_communities where slug = lower(comm); if cid is null then return '[]'; end if; end if;
  since := case period when 'day' then now() - interval '1 day' when 'week' then now() - interval '7 days' when 'month' then now() - interval '30 days'
                       when 'year' then now() - interval '365 days' else '-infinity'::timestamptz end;
  return coalesce((select jsonb_agg(public.d_post_json(x.pr) order by x.k1 desc, x.k2 desc) from (
    select p as pr,
      case when sort = 'hot' and p.pinned and (cid is not null or p.created_at > now() - interval '14 days') then 1 else 0 end k1,
      case sort
        when 'new' then extract(epoch from p.created_at)
        when 'top' then p.score * 1e10 + extract(epoch from p.created_at) / 1e3
        when 'rising' then (p.score + p.comment_count * 2 + 1) / power(extract(epoch from now() - p.created_at) / 3600 + 1, 1.8)
        else (greatest(p.score, 0) + p.comment_count * 0.5 + 1) / power(extract(epoch from now() - p.created_at) / 3600 + 2, 1.4) end k2
    from d_posts p join profiles u on u.id = p.author_id
    where not p.hidden and not u.banned
      and (cid is null or p.community_id = cid)
      and (d_feed.flair is null or p.flair = d_feed.flair)
      and (d_feed.city is null or lower(p.city) = lower(d_feed.city))
      and p.created_at >= since
      and (sort <> 'rising' or p.created_at > now() - interval '3 days')
    order by 2 desc, 3 desc limit least(greatest(lim, 1), 50) offset greatest(off, 0)) x), '[]');
end $$;

-- A thread: the post, every visible reply (flat, with parent ids), the community and related discussions
create or replace function public.d_thread(comm text, post text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p d_posts; c d_communities; pid uuid;
begin
  select * into c from d_communities where slug = lower(comm);
  if c.id is null then return null; end if;
  select * into p from d_posts where community_id = c.id and slug = lower(post) and (not hidden or author_id = auth.uid() or public.is_admin());
  if p.id is null then return null; end if;
  pid := coalesce(p.product_id, c.product_id);
  return jsonb_build_object(
    'post', public.d_post_json(p, true),
    'community', jsonb_build_object('slug', c.slug, 'title', c.title, 'about', c.about, 'color', c.color, 'kind', c.kind, 'member_count', c.member_count, 'post_count', c.post_count,
                   'joined', exists (select 1 from d_members m where m.community_id = c.id and m.user_id = auth.uid()),
                   'online', (select count(distinct x.author_id) from (select dc.author_id from d_comments dc join d_posts dp on dp.id = dc.post_id where dp.community_id = c.id and dc.created_at > now() - interval '1 hour'
                                                                      union all select author_id from d_posts where community_id = c.id and created_at > now() - interval '1 hour') x)),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'parent_id', m.parent_id, 'depth', m.depth, 'score', m.score, 'is_maker', m.is_maker,
        'body', case when m.deleted then '' else m.body end, 'deleted', m.deleted, 'created_at', m.created_at, 'edited_at', m.edited_at,
        'author', case when m.deleted then null else public.d_author(u, pid) end, 'mine', m.author_id = auth.uid(),
        'my_vote', coalesce((select value from d_votes v where v.comment_id = m.id and v.user_id = auth.uid()), 0)) order by m.created_at)
      from d_comments m join profiles u on u.id = m.author_id where m.post_id = p.id and (not m.hidden or m.author_id = auth.uid()) and not u.banned), '[]'),
    'related', coalesce((select jsonb_agg(jsonb_build_object('slug', r.slug, 'title', r.title, 'community', rc.slug, 'comment_count', r.comment_count) order by r.k desc) from (
        select q.*, (case when q.product_id is not distinct from p.product_id and q.product_id is not null then 1 else 0 end) * 2
                    + (case when q.community_id = p.community_id then 0.5 else 0 end)
                    + similarity(lower(q.title), lower(p.title)) * 3 + least(q.comment_count, 50) / 100.0 k
        from d_posts q where q.id <> p.id and not q.hidden order by k desc limit 4) r join d_communities rc on rc.id = r.community_id), '[]'),
    'can_moderate', auth.uid() is not null and (public.is_admin() or (c.product_id is not null and public.is_maker(c.product_id))));
end $$;

-- A community page: header, stats for product boards, makers, and whether you've joined
create or replace function public.d_community(comm text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c d_communities; pr products;
begin
  select * into c from d_communities where slug = lower(comm);
  if c.id is null then return null; end if;
  select * into pr from products where id = c.product_id;
  return jsonb_build_object(
    'slug', c.slug, 'title', c.title, 'about', c.about, 'color', c.color, 'kind', c.kind, 'member_count', c.member_count, 'post_count', c.post_count,
    'joined', exists (select 1 from d_members m where m.community_id = c.id and m.user_id = auth.uid()),
    'can_moderate', auth.uid() is not null and (public.is_admin() or (c.product_id is not null and public.is_maker(c.product_id))),
    'product', case when pr.id is null then null else jsonb_build_object('id', pr.id, 'slug', pr.slug, 'name', pr.name, 'logo_url', pr.logo_url, 'color', pr.color, 'verified', pr.verified, 'tagline', pr.tagline) end,
    'statuses', (select jsonb_build_object('shipped', count(*) filter (where status in ('shipped', 'fixed')), 'in_progress', count(*) filter (where status = 'in_progress'), 'planned', count(*) filter (where status = 'planned'))
                 from d_posts where community_id = c.id and not hidden),
    -- reply rate: posts by non-makers in the last 90 days that a maker replied to, and the median time to that reply
    'reply_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where maker_replied) / count(*)) end
                   from d_posts where community_id = c.id and not is_maker and not hidden and created_at > now() - interval '90 days'),
    'reply_hours', (select round((percentile_cont(0.5) within group (order by h))::numeric, 1) from (
                     select extract(epoch from (select min(m.created_at) from d_comments m where m.post_id = p.id and m.is_maker) - p.created_at) / 3600 h
                     from d_posts p where p.community_id = c.id and p.maker_replied and not p.is_maker and p.created_at > now() - interval '90 days') x),
    'makers', case when pr.id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('username', u.username, 'name', u.name, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'role', t.role))
                from (select pr.owner_id uid, 'Founder' role where pr.owner_id is not null
                      union select m.user_id, coalesce(nullif(m.role, ''), 'Maker') from product_makers m where m.product_id = pr.id and m.accepted and m.user_id is distinct from pr.owner_id) t
                join profiles u on u.id = t.uid where not u.banned), '[]') end);
end $$;

-- The right rail: topic communities, the most discussed products this week, and what you've joined
create or replace function public.d_rail() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'communities', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'color', c.color, 'member_count', c.member_count, 'post_count', c.post_count,
        'joined', exists (select 1 from d_members m where m.community_id = c.id and m.user_id = auth.uid())) order by c.rank, c.member_count desc) from d_communities c where c.kind = 'topic'), '[]'),
    'products', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name, 'logo_url', t.logo_url, 'color', t.color, 'threads', t.n) order by t.n desc) from (
        select c.slug, p.name, p.logo_url, p.color,
          (select count(*) from d_posts q where (q.community_id = c.id or q.product_id = p.id) and not q.hidden and q.created_at > now() - interval '7 days') n
        from d_communities c join products p on p.id = c.product_id where c.kind = 'product' order by 5 desc limit 4) t where t.n > 0), '[]'),
    'cities', coalesce((select jsonb_agg(city order by n desc) from (select initcap(city) city, count(*) n from d_posts where not hidden and coalesce(city, '') <> '' group by 1 order by 2 desc limit 8) c), '[]'),
    'mine', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'color', c.color, 'kind', c.kind) order by c.kind desc, c.rank)
        from d_members m join d_communities c on c.id = m.community_id where m.user_id = auth.uid()), '[]'));
$$;

-- Communities a member can post in (topics, plus their own products and any product community they joined)
create or replace function public.d_postable() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'title', c.title, 'color', c.color, 'kind', c.kind, 'member_count', c.member_count,
      'product', case when p.id is null then null else jsonb_build_object('slug', p.slug, 'name', p.name, 'logo_url', p.logo_url, 'color', p.color) end,
      'mine', p.id is not null and public.is_maker(p.id)) order by (p.id is not null and public.is_maker(p.id)) desc, c.kind desc, c.rank, c.member_count desc), '[]')
  from d_communities c left join products p on p.id = c.product_id
  where c.kind = 'topic' or public.is_maker(p.id) or exists (select 1 from d_members m where m.community_id = c.id and m.user_id = auth.uid());
$$;

-- Public threads for the sitemap: no hidden, no spam, nothing empty (it needs a reply or a few votes)
create or replace function public.d_sitemap() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('c', c.slug, 's', p.slug, 'mod', p.last_activity_at) order by p.last_activity_at desc), '[]')
  from d_posts p join d_communities c on c.id = p.community_id join profiles u on u.id = p.author_id
  where not p.hidden and not u.banned and (p.comment_count > 0 or p.score >= 3 or p.pinned) and char_length(p.body) >= 40;
$$;

-- ---------------------------------------------------------------- writing
create or replace function public.d_post_create(comm text, flair text, title text, body text default '', product text default null,
  link text default null, images text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c d_communities; pid uuid; s text; n int := 1; mk boolean; p d_posts;
begin
  if me is null then raise exception 'Sign in to post' using errcode = 'P0001'; end if;
  if exists (select 1 from profiles where id = me and banned) then raise exception 'Your account can’t post right now' using errcode = 'P0001'; end if;
  if (select count(*) from d_posts where author_id = me and created_at > now() - interval '1 hour') >= 5 then raise exception 'You’ve posted a lot in the last hour. Try again a little later.' using errcode = 'P0001'; end if;
  select * into c from d_communities where slug = lower(comm);
  if c.id is null then raise exception 'Pick a community' using errcode = 'P0001'; end if;
  title := regexp_replace(trim(coalesce(title, '')), '\s+', ' ', 'g');
  if char_length(title) < 8 then raise exception 'Give your post a clear title (at least 8 characters)' using errcode = 'P0001'; end if;
  if product is not null and product <> '' then select id into pid from products where slug = lower(product) and status in ('live', 'scheduled', 'unclaimed'); end if;
  pid := coalesce(pid, c.product_id);
  mk := pid is not null and (exists (select 1 from products where id = pid and owner_id = me) or exists (select 1 from product_makers where product_id = pid and user_id = me and accepted));
  -- Announcements are for the product's own team (or admins)
  if flair = 'announcement' and not (mk or public.is_admin()) then flair := 'discussion'; end if;
  if flair = 'megathread' and not public.is_admin() then flair := 'discussion'; end if;
  s := public.d_slugify(title);
  while exists (select 1 from d_posts where community_id = c.id and slug = s || case when n = 1 then '' else '-' || n end) loop n := n + 1; end loop;
  if n > 1 then s := s || '-' || n; end if;
  insert into d_posts (community_id, author_id, flair, title, body, slug, product_id, link_url, images, city, is_maker, score, ups)
  values (c.id, me, coalesce(nullif(flair, ''), 'discussion'), title, left(coalesce(body, ''), 20000), s,
          case when pid is distinct from c.product_id then pid end, nullif(trim(coalesce(link, '')), ''),
          coalesce((select array_agg(i) from (select i from unnest(images) i where i ~* '^https://' limit 6) z), '{}'),
          (select nullif(trim(city), '') from profiles where id = me), mk, 1, 1)
  returning * into p;
  insert into d_votes (user_id, post_id, value) values (me, p.id, 1) on conflict do nothing;
  insert into d_members (community_id, user_id) values (c.id, me) on conflict do nothing;
  update d_communities set post_count = post_count + 1, member_count = (select count(*) from d_members where community_id = c.id) where id = c.id;
  return jsonb_build_object('community', c.slug, 'slug', p.slug, 'id', p.id);
end $$;

create or replace function public.d_post_edit(pid uuid, title text, body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  title := regexp_replace(trim(coalesce(title, '')), '\s+', ' ', 'g');
  if char_length(title) < 8 then raise exception 'Give your post a clear title (at least 8 characters)' using errcode = 'P0001'; end if;
  update d_posts set title = d_post_edit.title, body = left(coalesce(d_post_edit.body, ''), 20000), edited_at = now()
  where id = pid and author_id = auth.uid();
  if not found then raise exception 'You can only edit your own posts' using errcode = 'P0001'; end if;
end $$;

-- Delete your own post (or, for admins, any post): hidden from everyone, kept for reports
create or replace function public.d_post_delete(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update d_posts set hidden = true where id = pid and (author_id = auth.uid() or public.is_admin());
  if not found then raise exception 'You can only delete your own posts' using errcode = 'P0001'; end if;
  update d_communities c set post_count = (select count(*) from d_posts where community_id = c.id and not hidden) where c.id = (select community_id from d_posts where id = pid);
end $$;

-- Makers (on their product's community) and admins: pin, and set Planned / In progress / Shipped / Fixed
create or replace function public.d_post_set(pid uuid, pinned boolean default null, status text default 'keep') returns void
language plpgsql security definer set search_path = public as $$
declare cp uuid;
begin
  select c.product_id into cp from d_posts p join d_communities c on c.id = p.community_id where p.id = pid;
  if not (public.is_admin() or (cp is not null and public.is_maker(cp))) then raise exception 'Only this community’s makers can do that' using errcode = 'P0001'; end if;
  update d_posts set pinned = coalesce(d_post_set.pinned, d_posts.pinned),
    status = case when d_post_set.status = 'keep' then d_posts.status when d_post_set.status in ('planned', 'in_progress', 'shipped', 'fixed') then d_post_set.status else null end
  where id = pid;
end $$;

create or replace function public.d_comment_create(pid uuid, parent uuid, body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p d_posts; par d_comments; prod uuid; mk boolean; m d_comments; who uuid; nm text; c d_communities;
begin
  if me is null then raise exception 'Sign in to reply' using errcode = 'P0001'; end if;
  if exists (select 1 from profiles where id = me and banned) then raise exception 'Your account can’t reply right now' using errcode = 'P0001'; end if;
  body := trim(coalesce(body, ''));
  if char_length(body) < 2 then raise exception 'Write a reply first' using errcode = 'P0001'; end if;
  if (select count(*) from d_comments where author_id = me and created_at > now() - interval '10 minutes') >= 30 then raise exception 'Slow down a little. Try again in a few minutes.' using errcode = 'P0001'; end if;
  select * into p from d_posts where id = pid and not hidden;
  if p.id is null then raise exception 'This post is no longer available' using errcode = 'P0001'; end if;
  select * into c from d_communities where id = p.community_id;
  if parent is not null then select * into par from d_comments where id = parent and post_id = pid; if par.id is null then raise exception 'That reply is no longer available' using errcode = 'P0001'; end if; end if;
  prod := coalesce(p.product_id, c.product_id);
  mk := prod is not null and (exists (select 1 from products where id = prod and owner_id = me) or exists (select 1 from product_makers where product_id = prod and user_id = me and accepted));
  insert into d_comments (post_id, parent_id, author_id, body, depth, is_maker, score, ups)
  values (pid, parent, me, left(body, 10000), coalesce(par.depth + 1, 0), mk, 1, 1) returning * into m;
  insert into d_votes (user_id, comment_id, value) values (me, m.id, 1) on conflict do nothing;
  update d_posts set comment_count = comment_count + 1, last_activity_at = now(), maker_replied = maker_replied or (mk and p.author_id <> me) where id = pid;
  -- Tell the person being replied to
  who := coalesce(par.author_id, p.author_id);
  if who is distinct from me then
    select coalesce(name, username) into nm from profiles where id = me;
    insert into notifications (user_id, type, grp, actor_id, product_id, title, body, link, action_label)
    values (who, 'discuss_reply', 'comments', me, prod, public.h_esc(nm) || case when par.id is null then ' replied to your post' else ' replied to your comment' end,
            left(body, 140), '/d/' || c.slug || '/' || p.slug || '#c-' || m.id, 'View reply');
  end if;
  return jsonb_build_object('id', m.id, 'parent_id', m.parent_id, 'depth', m.depth, 'score', m.score, 'is_maker', m.is_maker, 'body', m.body, 'deleted', false,
    'created_at', m.created_at, 'author', (select public.d_author(u, prod) from profiles u where u.id = me), 'mine', true, 'my_vote', 1);
end $$;

create or replace function public.d_comment_edit(cid uuid, body text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(body, ''))) < 2 then raise exception 'Write a reply first' using errcode = 'P0001'; end if;
  update d_comments set body = left(trim(d_comment_edit.body), 10000), edited_at = now() where id = cid and author_id = auth.uid() and not deleted;
  if not found then raise exception 'You can only edit your own replies' using errcode = 'P0001'; end if;
end $$;

-- Deleting a reply keeps its place in the thread ("deleted"), so the replies under it still make sense
create or replace function public.d_comment_delete(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update d_comments set deleted = true, body = '' where id = cid and (author_id = auth.uid() or public.is_admin());
  if not found then raise exception 'You can only delete your own replies' using errcode = 'P0001'; end if;
end $$;

-- Vote: kind 'post' or 'comment', value -1, 0 (clear) or 1. Returns the new score.
create or replace function public.d_vote(kind text, target uuid, val int) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); sc int;
begin
  if me is null then raise exception 'Sign in to vote' using errcode = 'P0001'; end if;
  if val not in (-1, 0, 1) then raise exception 'Invalid vote' using errcode = 'P0001'; end if;
  if kind = 'post' then
    if not exists (select 1 from d_posts where id = target and not hidden) then raise exception 'This post is no longer available' using errcode = 'P0001'; end if;
    delete from d_votes where user_id = me and post_id = target;
    if val <> 0 then insert into d_votes (user_id, post_id, value) values (me, target, val); end if;
    update d_posts set ups = (select count(*) from d_votes where post_id = target and value = 1), downs = (select count(*) from d_votes where post_id = target and value = -1),
      score = (select coalesce(sum(value), 0) from d_votes where post_id = target) where id = target returning score into sc;
  else
    if not exists (select 1 from d_comments where id = target and not deleted) then raise exception 'This reply is no longer available' using errcode = 'P0001'; end if;
    delete from d_votes where user_id = me and comment_id = target;
    if val <> 0 then insert into d_votes (user_id, comment_id, value) values (me, target, val); end if;
    update d_comments set ups = (select count(*) from d_votes where comment_id = target and value = 1), downs = (select count(*) from d_votes where comment_id = target and value = -1),
      score = (select coalesce(sum(value), 0) from d_votes where comment_id = target) where id = target returning score into sc;
  end if;
  return sc;
end $$;

create or replace function public.d_join(comm text, joining boolean) returns int
language plpgsql security definer set search_path = public as $$
declare c uuid; n int;
begin
  if auth.uid() is null then raise exception 'Sign in to join' using errcode = 'P0001'; end if;
  select id into c from d_communities where slug = lower(comm);
  if c is null then raise exception 'Community not found' using errcode = 'P0001'; end if;
  if joining then insert into d_members (community_id, user_id) values (c, auth.uid()) on conflict do nothing;
  else delete from d_members where community_id = c and user_id = auth.uid(); end if;
  update d_communities set member_count = (select count(*) from d_members where community_id = c) where id = c returning member_count into n;
  return n;
end $$;

grant execute on function public.d_feed(text, text, text, text, text, int, int), public.d_thread(text, text), public.d_community(text), public.d_rail(), public.d_sitemap() to anon, authenticated;
grant execute on function public.d_postable(), public.d_post_create(text, text, text, text, text, text, text[]), public.d_post_edit(uuid, text, text), public.d_post_delete(uuid),
  public.d_post_set(uuid, boolean, text), public.d_comment_create(uuid, uuid, text), public.d_comment_edit(uuid, text), public.d_comment_delete(uuid),
  public.d_vote(text, uuid, int), public.d_join(text, boolean) to authenticated;
revoke execute on function public.d_post_create(text, text, text, text, text, text, text[]), public.d_comment_create(uuid, uuid, text), public.d_vote(text, uuid, int), public.d_join(text, boolean) from anon;
