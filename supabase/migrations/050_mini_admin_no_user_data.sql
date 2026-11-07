-- Mini-admins don't see member data: the Users list (emails, phone), private messages and DMs,
-- the newsletter list, or email logs and nudge audiences (which list addresses). Super admins keep all of it.
do $$
declare f text; d text;
begin
  foreach f in array array['public.admin_users(text,uuid[])','public.can_read_channel(uuid)','public.admin_email_stats()','public.admin_nudge_audience(text[])','public.admin_send_nudges(text[],text,boolean,uuid[])'] loop
    d := pg_get_functiondef(f::regprocedure);
    d := replace(replace(d, 'public.is_admin()', 'public.is_full_admin()'), ' is_admin()', ' public.is_full_admin()');
    execute d;
  end loop;
end $$;
drop policy if exists "newsletter admin" on newsletter;
create policy "newsletter admin" on newsletter for select using (is_full_admin());
drop policy if exists "newsletter admin delete" on newsletter;
create policy "newsletter admin delete" on newsletter for delete using (is_full_admin());
drop policy if exists "email log admin" on public.email_log;
create policy "email log admin" on public.email_log for select using (public.is_full_admin());
