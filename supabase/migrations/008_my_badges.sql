-- One round trip for the sidebar badges instead of one count query per chat channel.
create or replace function public.my_badges() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'notifications', (select count(*) from notifications where user_id = auth.uid() and read_at is null),
    'by_channel', coalesce((
      select jsonb_object_agg(channel_id, n) from (
        select cm.channel_id,
               (select count(*) from messages m
                 where m.channel_id = cm.channel_id and m.parent_id is null
                   and m.created_at > cm.last_read_at and m.user_id <> auth.uid()) as n
        from channel_members cm where cm.user_id = auth.uid()
      ) x where n > 0), '{}'::jsonb)
  );
$$;
revoke execute on function public.my_badges() from public, anon;
grant execute on function public.my_badges() to authenticated;
