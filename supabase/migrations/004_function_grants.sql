-- Lock down SECURITY DEFINER functions: nothing is callable by default, then grant only what the app needs.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if f.proname in ('is_admin','is_maker','can_read_channel','week_slots','track_click','track_view') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    elsif f.proname in ('mark_all_read','open_dm','export_my_data','request_deletion','cancel_deletion','admin_stats','admin_review','admin_broadcast','admin_set_user') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
