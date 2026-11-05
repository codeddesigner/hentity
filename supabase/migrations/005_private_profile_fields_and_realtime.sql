-- Email and WhatsApp are private: hide the columns from the public API roles.
revoke select on public.profiles from anon, authenticated;
grant select (id, username, name, headline, bio, country, city, website, x, linkedin, avatar_url, avatar_color, role, is_verified, banned, is_seed, settings, interests, deletion_requested_at, username_changed_at, created_at) on public.profiles to anon, authenticated;

-- Your own full profile (including email and WhatsApp)
create or replace function public.my_profile() returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid();
$$;

-- Admin: full profile rows, searchable, or by id list
create or replace function public.admin_users(term text default null, ids uuid[] default null) returns setof public.profiles
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return query select * from profiles p
    where (ids is null or p.id = any(ids))
      and (term is null or term = '' or p.username ilike '%'||term||'%' or p.name ilike '%'||term||'%' or p.email ilike '%'||term||'%')
    order by p.created_at desc limit 300;
end $$;

revoke execute on function public.my_profile(), public.admin_users(text, uuid[]) from public, anon;
grant execute on function public.my_profile(), public.admin_users(text, uuid[]) to authenticated;

-- Live comments on product and news pages; live membership counts in chats
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'channel_members') then
    alter publication supabase_realtime add table public.channel_members;
  end if;
end $$;
