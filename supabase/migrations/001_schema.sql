-- Hentity schema: profiles, products & launches, votes, comments, follows, notifications,
-- chats (channels, product rooms, DMs, threads), news, moderation and admin tooling.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text unique not null check (username ~ '^[a-z0-9_]{3,30}$'),
  name text not null default '',
  email text,
  headline text default '' check (char_length(headline) <= 60),
  bio text default '' check (char_length(bio) <= 280),
  country text default 'NG',
  city text default '',
  website text default '',
  x text default '',
  linkedin text default '',
  whatsapp text default '',
  avatar_url text,
  avatar_color text,
  role text not null default 'user' check (role in ('user','moderator','admin')),
  is_verified boolean not null default false,
  banned boolean not null default false,
  is_seed boolean not null default false,
  settings jsonb not null default '{"showUpvotes":true,"showCity":true,"liveFeed":false,"indexable":true,"notif":{}}'::jsonb,
  interests text[] default '{}',
  deletion_requested_at timestamptz,
  username_changed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.profiles using gin (username gin_trgm_ops);
create index on public.profiles using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator') and not banned);
$$;

-- ---------------------------------------------------------------- weeks & companies
create table public.weeks (
  id int primary key,                       -- ISO week number of 2026 (+ 100*year offset not needed for demo)
  starts_at timestamptz not null,           -- Monday 06:00 WAT
  ends_at timestamptz not null,
  capacity int not null default 30
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage text default 'Pre-seed',
  city text default '',
  country text default 'NG',
  team_size int default 1,
  founded int,
  raised text default 'Undisclosed',
  verified boolean default false,
  registration text,
  owner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,80}$'),
  name text not null check (char_length(name) between 1 and 80),
  tagline text not null default '' check (char_length(tagline) <= 140),
  description text default '',
  website text default '',
  color text default '#000000',
  logo_url text,
  media jsonb not null default '[]'::jsonb,     -- [{url|color, kind}]
  video_url text,
  categories text[] not null default '{}',
  country text default 'NG',
  city text default '',
  countries text[] default '{}',
  pay_methods text[] not null default '{}',
  currencies text default '',
  languages text default 'English',
  platforms text default 'Web',
  stage text default 'Pre-seed',
  company_id uuid references public.companies(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','review','changes','scheduled','live','archived','rejected')),
  week_id int references public.weeks(id),
  intro text default '',
  support_pledge boolean default false,
  featured boolean not null default false,
  promoted boolean not null default false,
  verified boolean not null default false,
  verify jsonb not null default '{}'::jsonb,
  review_note text,
  review_items jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  upvote_count int not null default 0,
  comment_count int not null default 0,
  follower_count int not null default 0,
  click_count int not null default 0,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products (status, week_id);
create index on public.products using gin (name gin_trgm_ops);
create index on public.products (owner_id);

create table public.product_makers (
  product_id uuid references public.products(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text default 'Maker',
  accepted boolean default true,
  primary key (product_id, user_id)
);

create or replace function public.is_maker(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from products where id = p and owner_id = auth.uid())
      or exists (select 1 from product_makers where product_id = p and user_id = auth.uid());
$$;

-- live = scheduled and its week has started
create or replace view public.product_feed with (security_invoker = on) as
select p.*,
  case when p.status = 'scheduled' and w.starts_at <= now() then 'live' else p.status end as effective_status,
  w.starts_at as week_starts_at, w.ends_at as week_ends_at
from public.products p left join public.weeks w on w.id = p.week_id;

-- ---------------------------------------------------------------- engagement
create table public.upvotes (
  user_id uuid references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, product_id)
);
create index on public.upvotes (product_id, created_at);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  article_id uuid,
  parent_id uuid references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.comments (product_id, created_at);
create index on public.comments (article_id, created_at);

create table public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  target_type text check (target_type in ('user','product')),
  target_id uuid not null,
  created_at timestamptz default now(),
  primary key (follower_id, target_type, target_id)
);
create index on public.follows (target_type, target_id);

create table public.bookmarks (
  user_id uuid references public.profiles(id) on delete cascade,
  target_type text check (target_type in ('product','article')),
  target_id uuid not null,
  created_at timestamptz default now(),
  primary key (user_id, target_type, target_id)
);

create table public.notify_requests (
  user_id uuid references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, product_id)
);

create table public.blocks (
  user_id uuid references public.profiles(id) on delete cascade,
  blocked_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, blocked_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null,                 -- review | upvotes | comment | reply | follow | award | system
  grp text not null default 'launches' check (grp in ('launches','comments','followers','system')),
  actor_id uuid references public.profiles(id) on delete set null,
  product_id uuid references public.products(id) on delete cascade,
  title text not null,
  body text,
  link text,
  action_label text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- chats
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  description text default '',
  kind text not null default 'channel' check (kind in ('channel','product','dm')),
  product_id uuid references public.products(id) on delete cascade,
  pinned text,
  pinned_link text,
  rules text[] default '{}',
  archived boolean default false,
  position int default 100,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.channel_members (
  channel_id uuid references public.channels(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  last_read_at timestamptz default now(),
  joined_at timestamptz default now(),
  primary key (channel_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  parent_id uuid references public.messages(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','product','voice','system','image')),
  body text default '' check (char_length(body) <= 4000),
  product_id uuid references public.products(id) on delete set null,
  attachment_url text,
  duration int,
  transcript text,
  also_in_channel boolean default false,
  reply_count int not null default 0,
  last_reply_at timestamptz,
  deleted boolean default false,
  created_at timestamptz not null default now()
);
create index on public.messages (channel_id, created_at);
create index on public.messages (parent_id, created_at);

create table public.reactions (
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('upvote','rocket','check','heart','fire','clap')),
  primary key (message_id, user_id, emoji)
);

create or replace function public.can_read_channel(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels where id = c and kind <> 'dm')
      or exists (select 1 from channel_members where channel_id = c and user_id = auth.uid())
      or public.is_admin();
$$;

-- ---------------------------------------------------------------- news
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  dek text default '',
  bullets text[] default '{}',
  topic text not null default 'Launches',
  country text default 'NG',
  source text default 'Hentity',
  source_url text,
  source_initials text,
  color text default '#ff5b14',
  image_url text,
  read_minutes int default 4,
  is_lead boolean default false,
  status text not null default 'draft' check (status in ('draft','published')),
  channel_slug text,
  product_ids uuid[] default '{}',
  comment_count int default 0,
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
alter table public.comments add constraint comments_article_fk foreign key (article_id) references public.articles(id) on delete cascade;

create table public.newsletter (
  email text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table public.story_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  url text not null,
  note text,
  status text default 'new' check (status in ('new','used','dismissed')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------- moderation & admin
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text check (target_type in ('product','comment','message','user','article')),
  target_id uuid not null,
  reason text not null,
  status text default 'open' check (status in ('open','resolved','dismissed')),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function public.audit(a text, tt text, tid text, m jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log(actor_id, action, target_type, target_id, meta) values (auth.uid(), a, tt, tid, m);
$$;
