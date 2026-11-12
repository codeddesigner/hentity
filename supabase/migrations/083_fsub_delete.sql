-- Admins can delete funding suggestions (pending or decided). The member isn't notified;
-- any listing already created from the suggestion stays.
create or replace function public.fsub_delete(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
  delete from funding_submissions where id = sid;
  insert into audit_log (actor_id, action, target_type, target_id, meta) values (auth.uid(), 'funding_suggestion_deleted', 'funding_submission', sid::text, '{}'::jsonb);
end $$;
grant execute on function public.fsub_delete(uuid) to authenticated;
revoke execute on function public.fsub_delete(uuid) from anon;
