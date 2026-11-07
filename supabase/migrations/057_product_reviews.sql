-- Product reviews: anyone signed in rates a product 1–5 with a short written review (one per person, editable).
-- Makers can't review their own product; they can post one public reply per review. Readers mark reviews helpful.
-- Reviews from people who were accepted into the product's beta carry a "Beta tester" tag.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(body) between 20 and 2000),
  helpful_count int not null default 0,
  maker_reply text check (maker_reply is null or char_length(maker_reply) between 1 and 1000),
  maker_reply_at timestamptz,
  maker_reply_by uuid references public.profiles(id) on delete set null,
  hidden boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, user_id));
create index if not exists product_reviews_product on public.product_reviews(product_id, created_at desc);

create table if not exists public.product_review_votes (
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id));

-- Summary on the product row, kept in step by trigger
alter table public.products add column if not exists review_count int not null default 0;
alter table public.products add column if not exists rating_avg numeric(2,1);

alter table public.product_reviews enable row level security;
alter table public.product_review_votes enable row level security;
drop policy if exists "reviews read" on public.product_reviews;
create policy "reviews read" on public.product_reviews for select using (not hidden or user_id = auth.uid() or public.is_admin());
drop policy if exists "reviews write own" on public.product_reviews;
create policy "reviews write own" on public.product_reviews for insert with check (user_id = auth.uid());
drop policy if exists "reviews edit own" on public.product_reviews;
create policy "reviews edit own" on public.product_reviews for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "reviews delete own" on public.product_reviews;
create policy "reviews delete own" on public.product_reviews for delete using (user_id = auth.uid() or public.is_admin());
drop policy if exists "review votes read" on public.product_review_votes;
create policy "review votes read" on public.product_review_votes for select using (user_id = auth.uid());
drop policy if exists "review votes own" on public.product_review_votes;
create policy "review votes own" on public.product_review_votes for insert with check (user_id = auth.uid());
drop policy if exists "review votes delete own" on public.product_review_votes;
create policy "review votes delete own" on public.product_review_votes for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.product_reviews, public.product_review_votes to authenticated;

-- Rules a reviewer can't get around from the browser
create or replace function public.guard_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  -- system updates (Helpful counts, maker replies) set this flag; admins may moderate
  if public.is_admin() or current_setting('hentity.review_sys', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    select status into st from products where id = new.product_id;
    if st is null or st not in ('live', 'scheduled', 'unclaimed') then raise exception 'This product can’t be reviewed yet'; end if;
    if public.is_maker(new.product_id) then raise exception 'You can’t review your own product'; end if;
    new.user_id := auth.uid(); new.helpful_count := 0; new.hidden := false; new.edited_at := null;
    new.maker_reply := null; new.maker_reply_at := null; new.maker_reply_by := null;
    return new;
  end if;
  -- reviewers may change only their rating and text
  new.product_id := old.product_id; new.user_id := old.user_id; new.helpful_count := old.helpful_count; new.hidden := old.hidden;
  new.maker_reply := old.maker_reply; new.maker_reply_at := old.maker_reply_at; new.maker_reply_by := old.maker_reply_by; new.created_at := old.created_at;
  if new.rating is distinct from old.rating or new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
drop trigger if exists guard_review on public.product_reviews;
create trigger guard_review before insert or update on public.product_reviews for each row execute function public.guard_review();

create or replace function public.review_summary_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  perform set_config('hentity.counter', 'on', true);   -- let the product guard accept this counter update
  update products set
    review_count = (select count(*) from product_reviews where product_id = pid and not hidden),
    rating_avg = (select round(avg(rating)::numeric, 1) from product_reviews where product_id = pid and not hidden)
  where id = pid;
  perform set_config('hentity.counter', 'off', true);
  return null;
end $$;
drop trigger if exists review_summary_sync on public.product_reviews;
create trigger review_summary_sync after insert or update of rating, hidden or delete on public.product_reviews for each row execute function public.review_summary_sync();

create or replace function public.review_vote_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('hentity.review_sys', 'on', true);
  update product_reviews set helpful_count = (select count(*) from product_review_votes where review_id = coalesce(new.review_id, old.review_id))
  where id = coalesce(new.review_id, old.review_id);
  perform set_config('hentity.review_sys', 'off', true);
  return null;
end $$;
drop trigger if exists review_vote_sync on public.product_review_votes;
create trigger review_vote_sync after insert or delete on public.product_review_votes for each row execute function public.review_vote_sync();

-- You can't mark your own review helpful
create or replace function public.guard_review_vote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from product_reviews where id = new.review_id and user_id = auth.uid()) then raise exception 'That’s your own review'; end if;
  new.user_id := auth.uid(); return new;
end $$;
drop trigger if exists guard_review_vote on public.product_review_votes;
create trigger guard_review_vote before insert on public.product_review_votes for each row execute function public.guard_review_vote();

-- Tell the team about a new review
create or replace function public.review_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare p products; who text; m record;
begin
  select * into p from products where id = new.product_id;
  select name into who from profiles where id = new.user_id;
  for m in select p.owner_id as uid union select user_id from product_makers where product_id = p.id and accepted loop
    perform public.notify(m.uid, 'product_review', 'comments',
      '<b>' || public.h_esc(coalesce(who, 'Someone')) || '</b> gave <b>' || public.h_esc(p.name) || '</b> ' || new.rating || ' star' || case when new.rating = 1 then '' else 's' end || '.',
      left(new.body, 140), '/products/' || p.slug || '#reviews', 'Read and reply', new.user_id, p.id);
  end loop;
  return new;
end $$;
drop trigger if exists review_notify on public.product_reviews;
create trigger review_notify after insert on public.product_reviews for each row execute function public.review_notify();

-- Everything the product page shows, in one call: summary, distribution, reviews with authors, and the viewer's own state
create or replace function public.product_reviews(pid uuid, sort text default 'helpful', lim int default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'count', (select count(*) from product_reviews where product_id = pid and not hidden),
    'avg', (select round(avg(rating)::numeric, 1) from product_reviews where product_id = pid and not hidden),
    'dist', (select jsonb_object_agg(s, (select count(*) from product_reviews where product_id = pid and not hidden and rating = s)) from generate_series(1, 5) s),
    'can_review', auth.uid() is not null and not public.is_maker(pid),
    'is_maker', auth.uid() is not null and public.is_maker(pid),
    'reviews', coalesce((select jsonb_agg(x.j order by x.k1 desc, x.k2 desc) from (
      select case sort when 'newest' then extract(epoch from r.created_at) when 'high' then r.rating * 1e12 + extract(epoch from r.created_at) when 'low' then (6 - r.rating) * 1e12 + extract(epoch from r.created_at) else r.helpful_count end as k1,
             extract(epoch from r.created_at) as k2,
        jsonb_build_object('id', r.id, 'rating', r.rating, 'body', r.body, 'helpful', r.helpful_count, 'created_at', r.created_at, 'edited_at', r.edited_at,
          'mine', r.user_id = auth.uid(), 'voted', exists (select 1 from product_review_votes v where v.review_id = r.id and v.user_id = auth.uid()),
          'tester', exists (select 1 from beta_applications a join betas b on b.id = a.beta_id where b.product_id = pid and a.user_id = r.user_id and a.status = 'accepted'),
          'user', jsonb_build_object('id', u.id, 'name', u.name, 'username', u.username, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'headline', u.headline, 'is_verified', u.is_verified),
          'reply', case when r.maker_reply is null then null else jsonb_build_object('body', r.maker_reply, 'at', r.maker_reply_at,
            'by', (select jsonb_build_object('name', mu.name, 'username', mu.username, 'avatar_url', mu.avatar_url, 'avatar_color', mu.avatar_color) from profiles mu where mu.id = r.maker_reply_by)) end) as j
      from product_reviews r join profiles u on u.id = r.user_id
      where r.product_id = pid and (not r.hidden or r.user_id = auth.uid()) and not u.banned
      order by 1 desc, 2 desc limit least(lim, 200)) x), '[]'::jsonb));
$$;
grant execute on function public.product_reviews(uuid, text, int) to anon, authenticated;

-- A maker's public reply (empty text removes it)
create or replace function public.review_reply(rid uuid, txt text) returns void
language plpgsql security definer set search_path = public as $$
declare r product_reviews;
begin
  select * into r from product_reviews where id = rid;
  if r.id is null then raise exception 'Review not found'; end if;
  if not public.is_maker(r.product_id) and not public.is_admin() then raise exception 'Only the product’s team can reply'; end if;
  perform set_config('hentity.review_sys', 'on', true);
  update product_reviews set maker_reply = nullif(trim(txt), ''), maker_reply_at = case when nullif(trim(txt), '') is null then null else now() end,
    maker_reply_by = case when nullif(trim(txt), '') is null then null else auth.uid() end where id = rid;
  perform set_config('hentity.review_sys', 'off', true);
  if nullif(trim(txt), '') is not null then
    perform public.notify(r.user_id, 'review_reply', 'comments', 'The team replied to your review of <b>' || public.h_esc((select name from products where id = r.product_id)) || '</b>.',
      left(trim(txt), 140), '/products/' || (select slug from products where id = r.product_id) || '#reviews', 'See reply', auth.uid(), r.product_id);
  end if;
end $$;
grant execute on function public.review_reply(uuid, text) to authenticated;

-- Reviews can be reported like comments
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in ('product','comment','message','user','article','review'));
