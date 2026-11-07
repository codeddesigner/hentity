-- Marking a chat as read uses the server's clock (a phone clock running slow made fresh messages look unread)
-- and covers every message already in the channel.
create or replace function public.mark_channel_read(cid uuid) returns void
language sql security definer set search_path = public as $$
  insert into channel_members (channel_id, user_id, last_read_at)
  select cid, auth.uid(), greatest(now(), coalesce((select max(created_at) from messages where channel_id = cid), now()))
  where auth.uid() is not null and exists (select 1 from channels where id = cid)
  on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;
revoke execute on function public.mark_channel_read(uuid) from public, anon;
grant execute on function public.mark_channel_read(uuid) to authenticated;
