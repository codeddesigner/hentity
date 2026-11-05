-- Triggers, row level security, RPCs, storage and realtime for Hentity.

-- ================================================================ triggers
-- New auth user -> profile. The owner email becomes admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-z0-9_]', '', 'g'));
  uname text;
  n int := 0;
begin
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 26);
  uname := base;
  while exists (select 1 from profiles where username = uname) loop
    n := n + 1; uname := base || n;
  end loop;
  insert into profiles (id, username, name, email, role, avatar_url)
  values (new.id, uname,
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', initcap(split_part(new.email,'@',1))),
          new.email,
          case when lower(new.email) = 'encircode@gmail.com' then 'admin' else 'user' end,
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Keep privileged profile columns admin-only
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role := old.role; new.is_verified := old.is_verified; new.banned := old.banned; new.is_seed := old.is_seed; new.email := old.email;
    if new.username <> old.username then
      if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
        raise exception 'You can change your username once every 30 days';
      end if;
      new.username_changed_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger guard_profile before update on public.profiles for each row execute function public.guard_profile();

-- Keep moderation-only product columns admin-only and enforce the submission state machine
create or replace function public.guard_product() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken int; cap int;
begin
  new.updated_at := now();
  if public.is_admin() or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.status := 'draft';
    new.featured := false; new.promoted := false; new.verified := false;
    new.upvote_count := 0; new.comment_count := 0; new.follower_count := 0; new.click_count := 0; new.view_count := 0;
    return new;
  end if;
  -- counter triggers (upvotes, comments, follows, clicks) set this flag so their updates pass through
  if current_setting('hentity.counter', true) = 'on' then return new; end if;
  new.featured := old.featured; new.promoted := old.promoted; new.verified := old.verified;
  new.upvote_count := old.upvote_count; new.comment_count := old.comment_count; new.follower_count := old.follower_count;
  new.click_count := old.click_count; new.view_count := old.view_count; new.owner_id := old.owner_id;
  new.review_note := old.review_note; new.review_items := old.review_items; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
  -- allowed maker transitions
  if new.status <> old.status then
    if not ((old.status in ('draft','changes') and new.status = 'review')
         or (old.status = 'review' and new.status = 'draft')
         or (old.status = 'scheduled' and new.status = 'draft')
         or (old.status in ('draft','changes','rejected') and new.status = 'archived')) then
      raise exception 'Status change % -> % is not allowed', old.status, new.status;
    end if;
    if new.status = 'review' then new.submitted_at := now(); end if;
  elsif old.status in ('review','live') or (old.status = 'scheduled' and new.week_id is distinct from old.week_id) then
    raise exception 'This product can''t be edited right now';
  end if;
  if new.status = 'review' and new.week_id is not null then
    select capacity into cap from weeks where id = new.week_id;
    select count(*) into taken from products where week_id = new.week_id and status in ('review','scheduled','live') and id <> new.id;
    if taken >= cap then raise exception 'WEEK_FULL'; end if;
  end if;
  return new;
end $$;
create trigger guard_product before insert or update on public.products for each row execute function public.guard_product();

-- Notifications helper
create or replace function public.notify(uid uuid, t text, g text, ttl text, bdy text, lnk text, act text default null, actor uuid default auth.uid(), prod uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if uid is null or uid = actor then return; end if;
  insert into notifications(user_id, type, grp, title, body, link, action_label, actor_id, product_id) values (uid, t, g, ttl, bdy, lnk, act, actor, prod);
end $$;

-- Product status changes -> maker notifications + audit
create or replace function public.on_product_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare range text;
begin
  if new.status is distinct from old.status then
    select to_char(starts_at at time zone 'Africa/Lagos','DD Mon') into range from weeks where id = new.week_id;
    if new.status = 'scheduled' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> was approved and booked for the week of '||coalesce(range,'your chosen week')||'.', 'Review', '/scheduled?p='||new.slug, 'View schedule', null, new.id);
    elsif new.status = 'changes' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> needs changes: '||coalesce(new.review_note,'see the moderator note')||'', 'Review', '/changes-requested?p='||new.slug, 'Edit submission', null, new.id);
    elsif new.status = 'rejected' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> wasn''t approved: '||coalesce(new.review_note,''), 'Review', '/my-products', null, null, new.id);
    elsif new.status = 'live' then
      perform notify(new.owner_id, 'review', 'launches', '<b>'||new.name||'</b> is live on the board.', 'Launch', '/launch-week?p='||new.slug, 'View launch', null, new.id);
    end if;
    if public.is_admin() and old.status <> new.status then
      perform audit('product.status', 'product', new.id::text, jsonb_build_object('from',old.status,'to',new.status,'note',new.review_note));
    end if;
  end if;
  return new;
end $$;
create trigger on_product_status after update on public.products for each row execute function public.on_product_status();

-- Product approved -> its own chat room
create or replace function public.ensure_product_room() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('scheduled','live') and not exists (select 1 from channels where product_id = new.id) then
    insert into channels(slug, name, description, kind, product_id, rules, position)
    values ('p-'||new.slug, new.name, new.tagline, 'product', new.id, array['Questions for the makers go here, not in DMs.','No vote trading. Ever.','Found a bug? Post it in #feedback-swap.'], 200);
  end if;
  return new;
end $$;
create trigger ensure_product_room after insert or update of status on public.products for each row execute function public.ensure_product_room();

-- Counters
create or replace function public.count_upvotes() returns trigger
language plpgsql security definer set search_path = public as $$
declare p products;
begin
  if tg_op = 'INSERT' then
    update products set upvote_count = upvote_count + 1 where id = new.product_id returning * into p;
    if p.upvote_count in (100,250,500,1000) or p.upvote_count % 50 = 0 then
      perform notify(p.owner_id, 'upvotes', 'launches', '<b>'||p.name||'</b> reached '||p.upvote_count||' upvotes', 'Upvotes', '/launch-week?p='||p.slug, null, new.user_id, p.id);
    end if;
  else
    update products set upvote_count = greatest(upvote_count - 1, 0) where id = old.product_id;
  end if;
  return null;
end $$;
create trigger count_upvotes after insert or delete on public.upvotes for each row execute function public.count_upvotes();

create or replace function public.check_upvote() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text; o uuid;
begin
  select effective_status, owner_id into s, o from product_feed where id = new.product_id;
  if s not in ('live') then raise exception 'Upvotes open when the launch week starts'; end if;
  if o = new.user_id or exists (select 1 from product_makers where product_id = new.product_id and user_id = new.user_id) then raise exception 'Makers can''t upvote their own product'; end if;
  if exists (select 1 from profiles where id = new.user_id and banned) then raise exception 'Account suspended'; end if;
  return new;
end $$;
create trigger check_upvote before insert on public.upvotes for each row execute function public.check_upvote();

create or replace function public.count_comments() returns trigger
language plpgsql security definer set search_path = public as $$
declare p products; parent_author uuid; nm text;
begin
  if tg_op = 'INSERT' then
    select name into nm from profiles where id = new.user_id;
    if new.product_id is not null then
      update products set comment_count = comment_count + 1 where id = new.product_id returning * into p;
      if new.parent_id is null then
        perform notify(p.owner_id, 'comment', 'comments', '<b>'||coalesce(nm,'Someone')||'</b> commented on <b>'||p.name||'</b>: “'||left(new.body,120)||'”', p.name, '/products/'||p.slug||'#c-'||new.id, 'Reply', new.user_id, p.id);
      end if;
    end if;
    if new.article_id is not null then update articles set comment_count = comment_count + 1 where id = new.article_id; end if;
    if new.parent_id is not null then
      select user_id into parent_author from comments where id = new.parent_id;
      perform notify(parent_author, 'reply', 'comments', '<b>'||coalesce(nm,'Someone')||'</b> replied: “'||left(new.body,120)||'”', coalesce(p.name,'Discussion'), coalesce('/products/'||p.slug,'/news')||'#c-'||new.id, 'Reply', new.user_id, p.id);
    end if;
  elsif tg_op = 'UPDATE' and new.deleted and not old.deleted then
    if new.product_id is not null then update products set comment_count = greatest(comment_count - 1,0) where id = new.product_id; end if;
    if new.article_id is not null then update articles set comment_count = greatest(comment_count - 1,0) where id = new.article_id; end if;
  end if;
  return null;
end $$;
create trigger count_comments after insert or update on public.comments for each row execute function public.count_comments();

create or replace function public.count_follows() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text;
begin
  if tg_op = 'INSERT' then
    if new.target_type = 'product' then update products set follower_count = follower_count + 1 where id = new.target_id;
    else
      select name into nm from profiles where id = new.follower_id;
      perform notify(new.target_id, 'follow', 'followers', '<b>'||coalesce(nm,'Someone')||'</b> started following you.', 'Followers', '/makers/'||(select username from profiles where id = new.follower_id), 'Follow back', new.follower_id);
    end if;
  else
    if old.target_type = 'product' then update products set follower_count = greatest(follower_count - 1,0) where id = old.target_id; end if;
  end if;
  return null;
end $$;
create trigger count_follows after insert or delete on public.follows for each row execute function public.count_follows();

create or replace function public.count_replies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null then
    update messages set reply_count = reply_count + 1, last_reply_at = new.created_at where id = new.parent_id;
  end if;
  return null;
end $$;
create trigger count_replies after insert on public.messages for each row execute function public.count_replies();

-- Board moves show up as system lines in #launch-week
create or replace function public.post_board_move() returns trigger
language plpgsql security definer set search_path = public as $$
declare new_rank int; old_rank int; ch uuid;
begin
  if new.upvote_count <= old.upvote_count or new.status not in ('scheduled','live') then return null; end if;
  select count(*)+1 into new_rank from product_feed where week_id = new.week_id and effective_status='live' and not promoted and upvote_count > new.upvote_count;
  select count(*)+1 into old_rank from product_feed where week_id = new.week_id and effective_status='live' and not promoted and id <> new.id and upvote_count > old.upvote_count;
  if new_rank < old_rank and new_rank <= 3 then
    select id into ch from channels where slug = 'launch-week';
    if ch is not null then
      insert into messages(channel_id, kind, body, product_id) values (ch, 'system', new.name||' moved up to #'||new_rank||' · '||new.upvote_count||' upvotes', new.id);
    end if;
  end if;
  return null;
end $$;
create trigger post_board_move after update of upvote_count on public.products for each row execute function public.post_board_move();

-- ================================================================ RLS
alter table public.profiles enable row level security;
alter table public.weeks enable row level security;
alter table public.companies enable row level security;
alter table public.products enable row level security;
alter table public.product_makers enable row level security;
alter table public.upvotes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notify_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
alter table public.articles enable row level security;
alter table public.newsletter enable row level security;
alter table public.story_suggestions enable row level security;
alter table public.reports enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_log enable row level security;

-- profiles
create policy "profiles readable" on profiles for select using (true);
create policy "own profile update" on profiles for update using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());
create policy "admin profile delete" on profiles for delete using (is_admin());
-- weeks / settings
create policy "weeks readable" on weeks for select using (true);
create policy "weeks admin" on weeks for all using (is_admin()) with check (is_admin());
create policy "settings readable" on site_settings for select using (true);
create policy "settings admin" on site_settings for all using (is_admin()) with check (is_admin());
-- companies
create policy "companies readable" on companies for select using (true);
create policy "companies insert" on companies for insert with check (auth.uid() is not null and owner_id = auth.uid());
create policy "companies update" on companies for update using (owner_id = auth.uid() or is_admin());
create policy "companies delete" on companies for delete using (is_admin());
-- products
create policy "products public" on products for select using (status in ('scheduled','live') or owner_id = auth.uid() or is_maker(id) or is_admin());
create policy "products insert" on products for insert with check (auth.uid() is not null and not exists (select 1 from profiles where id = auth.uid() and banned));
create policy "products update" on products for update using (owner_id = auth.uid() or is_admin());
create policy "products delete" on products for delete using ((owner_id = auth.uid() and status in ('draft','archived')) or is_admin());
-- makers
create policy "makers readable" on product_makers for select using (true);
create policy "makers manage" on product_makers for insert with check (exists (select 1 from products where id = product_id and owner_id = auth.uid()) or is_admin());
create policy "makers accept" on product_makers for update using (user_id = auth.uid() or is_admin());
create policy "makers remove" on product_makers for delete using (user_id = auth.uid() or exists (select 1 from products where id = product_id and owner_id = auth.uid()) or is_admin());
-- upvotes
create policy "upvotes readable" on upvotes for select using (true);
create policy "upvote own" on upvotes for insert with check (user_id = auth.uid());
create policy "unvote own" on upvotes for delete using (user_id = auth.uid() or is_admin());
-- comments
create policy "comments readable" on comments for select using (true);
create policy "comment own" on comments for insert with check (user_id = auth.uid() and not exists (select 1 from profiles where id = auth.uid() and banned));
create policy "comment edit" on comments for update using (user_id = auth.uid() or is_admin());
create policy "comment delete" on comments for delete using (is_admin());
-- follows, bookmarks, notify, blocks
create policy "follows readable" on follows for select using (true);
create policy "follow own" on follows for insert with check (follower_id = auth.uid());
create policy "unfollow own" on follows for delete using (follower_id = auth.uid());
create policy "bookmarks own" on bookmarks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notify own" on notify_requests for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notify admin read" on notify_requests for select using (is_admin());
create policy "blocks own" on blocks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- notifications
create policy "notifications own" on notifications for select using (user_id = auth.uid());
create policy "notifications mark" on notifications for update using (user_id = auth.uid());
create policy "notifications admin" on notifications for all using (is_admin()) with check (is_admin());
-- chats
create policy "channels visible" on channels for select using (kind <> 'dm' or exists (select 1 from channel_members m where m.channel_id = id and m.user_id = auth.uid()) or is_admin());
create policy "channels admin" on channels for all using (is_admin()) with check (is_admin());
create policy "members visible" on channel_members for select using (user_id = auth.uid() or can_read_channel(channel_id));
create policy "join channel" on channel_members for insert with check (user_id = auth.uid() and exists (select 1 from channels where id = channel_id and kind <> 'dm'));
create policy "update membership" on channel_members for update using (user_id = auth.uid());
create policy "leave channel" on channel_members for delete using (user_id = auth.uid() or is_admin());
create policy "messages readable" on messages for select using (can_read_channel(channel_id));
create policy "post message" on messages for insert with check (user_id = auth.uid() and kind <> 'system' and can_read_channel(channel_id) and not exists (select 1 from profiles where id = auth.uid() and banned));
create policy "edit own message" on messages for update using (user_id = auth.uid() or is_admin());
create policy "delete message" on messages for delete using (user_id = auth.uid() or is_admin());
create policy "reactions readable" on reactions for select using (true);
create policy "react own" on reactions for insert with check (user_id = auth.uid());
create policy "unreact own" on reactions for delete using (user_id = auth.uid());
-- news
create policy "articles published" on articles for select using (status = 'published' or is_admin());
create policy "articles admin" on articles for all using (is_admin()) with check (is_admin());
create policy "newsletter subscribe" on newsletter for insert with check (true);
create policy "newsletter admin" on newsletter for select using (is_admin());
create policy "newsletter admin delete" on newsletter for delete using (is_admin());
create policy "suggest story" on story_suggestions for insert with check (auth.uid() is not null and user_id = auth.uid());
create policy "suggestions admin" on story_suggestions for all using (is_admin()) with check (is_admin());
-- moderation
create policy "report" on reports for insert with check (auth.uid() is not null and reporter_id = auth.uid());
create policy "reports admin" on reports for all using (is_admin()) with check (is_admin());
create policy "audit admin" on audit_log for select using (is_admin());

-- ================================================================ RPCs
create or replace function public.week_slots() returns table(id int, starts_at timestamptz, ends_at timestamptz, capacity int, taken int)
language sql stable security definer set search_path = public as $$
  select w.id, w.starts_at, w.ends_at, w.capacity,
    (select count(*)::int from products p where p.week_id = w.id and p.status in ('review','scheduled','live'))
  from weeks w where w.ends_at > now() order by w.starts_at limit 6;
$$;

create or replace function public.current_week() returns weeks
language sql stable set search_path = public as $$
  select * from weeks where starts_at <= now() and ends_at > now() order by starts_at desc limit 1;
$$;

create or replace function public.mark_all_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.track_click(p uuid) returns void
language sql security definer set search_path = public as $$ update products set click_count = click_count + 1 where id = p; $$;
create or replace function public.track_view(p uuid) returns void
language sql security definer set search_path = public as $$ update products set view_count = view_count + 1 where id = p; $$;

-- Start or open a direct message with another user
create or replace function public.open_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; me uuid := auth.uid(); nm text;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select m1.channel_id into c from channel_members m1 join channel_members m2 on m1.channel_id = m2.channel_id
    join channels ch on ch.id = m1.channel_id and ch.kind = 'dm' where m1.user_id = me and m2.user_id = other limit 1;
  if c is null then
    select name into nm from profiles where id = other;
    insert into channels(name, kind, created_by) values (coalesce(nm,'Direct message'), 'dm', me) returning id into c;
    insert into channel_members(channel_id, user_id) values (c, me), (c, other);
  end if;
  return c;
end $$;

-- Everything a user has put on Hentity
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where id = auth.uid()),
    'products', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from products x where owner_id = auth.uid()),
    'comments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from comments x where user_id = auth.uid()),
    'upvotes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from upvotes x where user_id = auth.uid()),
    'follows', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from follows x where follower_id = auth.uid()),
    'messages', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from messages x where user_id = auth.uid()),
    'exported_at', now());
$$;

create or replace function public.request_deletion() returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set deletion_requested_at = now() where id = auth.uid();
  update products set status = 'archived' where owner_id = auth.uid() and status in ('draft','review','changes','scheduled')
    and not exists (select 1 from product_makers m where m.product_id = products.id and m.user_id <> auth.uid());
  insert into audit_log(actor_id, action, target_type, target_id) values (auth.uid(), 'account.delete_requested', 'user', auth.uid()::text);
end $$;
create or replace function public.cancel_deletion() returns void
language sql security definer set search_path = public as $$ update profiles set deletion_requested_at = null where id = auth.uid(); $$;

-- Admin
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return jsonb_build_object(
    'users', (select count(*) from profiles where not is_seed),
    'users_week', (select count(*) from profiles where created_at > now() - interval '7 days' and not is_seed),
    'products', (select count(*) from products),
    'live', (select count(*) from product_feed where effective_status = 'live'),
    'review', (select count(*) from products where status = 'review'),
    'scheduled', (select count(*) from product_feed where effective_status = 'scheduled'),
    'upvotes_week', (select count(*) from upvotes where created_at > now() - interval '7 days'),
    'comments_week', (select count(*) from comments where created_at > now() - interval '7 days'),
    'messages_week', (select count(*) from messages where created_at > now() - interval '7 days'),
    'reports_open', (select count(*) from reports where status = 'open'),
    'subscribers', (select count(*) from newsletter),
    'suggestions', (select count(*) from story_suggestions where status = 'new'),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]') from (
        select date_trunc('day', created_at)::date d, count(*) n from profiles where created_at > now() - interval '14 days' and not is_seed group by 1) s),
    'votes_by_day', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d), '[]') from (
        select date_trunc('day', created_at)::date d, count(*) n from upvotes where created_at > now() - interval '14 days' group by 1) s)
  );
end $$;

create or replace function public.admin_review(p uuid, decision text, note text default null, items jsonb default '[]'::jsonb, wk int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if decision not in ('scheduled','changes','rejected','live','review','archived','draft') then raise exception 'Unknown decision'; end if;
  update products set status = decision, review_note = note, review_items = coalesce(items,'[]'::jsonb),
    reviewed_at = now(), reviewed_by = auth.uid(), week_id = coalesce(wk, week_id) where id = p;
end $$;

create or replace function public.admin_broadcast(ttl text, bdy text, lnk text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  insert into notifications(user_id, type, grp, title, body, link, actor_id)
    select id, 'system', 'system', ttl, bdy, lnk, auth.uid() from profiles where not is_seed and not banned;
  get diagnostics n = row_count;
  perform audit('notifications.broadcast', 'all', null, jsonb_build_object('title', ttl, 'count', n));
  return n;
end $$;

create or replace function public.admin_set_user(u uuid, new_role text default null, verified boolean default null, is_banned boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then raise exception 'Admins only'; end if;
  update profiles set role = coalesce(new_role, role), is_verified = coalesce(verified, is_verified), banned = coalesce(is_banned, banned) where id = u;
  perform audit('user.update', 'user', u::text, jsonb_build_object('role', new_role, 'verified', verified, 'banned', is_banned));
end $$;

revoke execute on function public.admin_stats, public.admin_review, public.admin_broadcast, public.admin_set_user from anon;
revoke execute on function public.notify(uuid,text,text,text,text,text,text,uuid,uuid) from anon, authenticated;
revoke execute on function public.audit(text,text,text,jsonb) from anon, authenticated;

-- ================================================================ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','audio/webm','audio/mpeg','audio/mp4','audio/ogg'])
on conflict (id) do nothing;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
create policy "media own upload" on storage.objects for insert to authenticated with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media own update" on storage.objects for update to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media own delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
create policy "media admin upload" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());

-- ================================================================ realtime
alter publication supabase_realtime add table public.messages, public.reactions, public.products, public.notifications, public.upvotes;
