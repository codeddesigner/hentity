-- Full admins can delete a spotlight; its News story goes with it.
create or replace function public.sp_delete(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare aid uuid;
begin
  if not public.sp_super() then raise exception 'Only a full admin can do this' using errcode = 'P0001'; end if;
  delete from spotlights where id = sid returning article_id into aid;
  if aid is not null then delete from articles where id = aid; end if;
  perform public.audit('spotlight.deleted', 'spotlight', sid::text, jsonb_build_object('article', aid));
end $$;
grant execute on function public.sp_delete(uuid) to authenticated;
revoke execute on function public.sp_delete(uuid) from anon;
