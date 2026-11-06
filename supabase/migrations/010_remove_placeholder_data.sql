-- Remove all sample (seed) content from 003_seed.sql. A copy is kept in schema seed_backup, which the public
-- API can't see (restore with: insert into public.<table> select * from seed_backup.<table>).
create schema if not exists seed_backup;
revoke all on schema seed_backup from public, anon, authenticated;

create table seed_backup.profiles as select * from public.profiles where is_seed;
create table seed_backup.products as select * from public.products where owner_id in (select id from public.profiles where is_seed);
create table seed_backup.product_makers as select * from public.product_makers where product_id in (select id from seed_backup.products) or user_id in (select id from seed_backup.profiles);
create table seed_backup.companies as select * from public.companies where owner_id is null or owner_id in (select id from seed_backup.profiles);
create table seed_backup.comments as select * from public.comments where user_id in (select id from seed_backup.profiles) or product_id in (select id from seed_backup.products);
create table seed_backup.messages as select * from public.messages where user_id is null or user_id in (select id from seed_backup.profiles);
create table seed_backup.reactions as select * from public.reactions where message_id in (select id from seed_backup.messages);
create table seed_backup.channels as select * from public.channels where kind = 'product' and product_id in (select id from seed_backup.products);
create table seed_backup.articles as select * from public.articles where created_by is null or created_by in (select id from seed_backup.profiles);
create table seed_backup.site_settings as select * from public.site_settings;
create table seed_backup.channels_before as select * from public.channels where kind = 'channel';

delete from public.reactions where message_id in (select id from seed_backup.messages);
delete from public.messages where id in (select id from seed_backup.messages);
delete from public.comments where id in (select id from seed_backup.comments);
delete from public.channel_members where channel_id in (select id from seed_backup.channels);
delete from public.channels where id in (select id from seed_backup.channels);
delete from public.notifications where product_id in (select id from seed_backup.products) or actor_id in (select id from seed_backup.profiles) or user_id in (select id from seed_backup.profiles);
delete from public.upvotes where product_id in (select id from seed_backup.products) or user_id in (select id from seed_backup.profiles);
delete from public.follows where follower_id in (select id from seed_backup.profiles) or target_id in (select id from seed_backup.profiles) or target_id in (select id from seed_backup.products);
delete from public.bookmarks where target_id in (select id from seed_backup.products) or target_id in (select id from seed_backup.articles);
delete from public.notify_requests where product_id in (select id from seed_backup.products);
delete from public.product_makers where product_id in (select id from seed_backup.products) or user_id in (select id from seed_backup.profiles);
delete from public.products where id in (select id from seed_backup.products);
delete from public.companies where id in (select id from seed_backup.companies);
delete from public.articles where id in (select id from seed_backup.articles);
delete from public.channel_members where user_id in (select id from seed_backup.profiles);
delete from public.profiles where id in (select id from seed_backup.profiles);

update public.channels set pinned = null, pinned_link = null where slug = 'launch-week';
update public.channels set description = 'This week''s launches: cheer each other on, ask questions, swap feedback' where slug = 'launch-week';
update public.site_settings set value = jsonb_set(value, '{items}', '[]'::jsonb) where key = 'morning_brief';
delete from public.site_settings where key = 'stats';

-- Public stats are counted from real data instead of a hand-typed setting
create or replace function public.public_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'products', (select count(*) from products where status in ('scheduled', 'live')),
    'countries', (select count(distinct country) from products where status in ('scheduled', 'live')),
    'makers', (select count(*) from profiles where not banned)
  );
$$;
revoke execute on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
