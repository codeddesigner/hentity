-- Fix: audit() takes the record id as text; the broadcast id was passed as uuid, so every send failed (and rolled back).
create or replace function public.admin_broadcast_send(ttl text, bdy text, lnk text, aud jsonb, mode text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bid uuid; np int := 0; nd int := 0; secret text; batch jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = 'P0001'; end if;
  ttl := trim(coalesce(ttl, '')); bdy := trim(coalesce(bdy, ''));
  if char_length(ttl) < 2 then raise exception 'Add a title' using errcode = 'P0001'; end if;
  if mode not in ('push', 'inapp', 'both') then raise exception 'Pick how to send it' using errcode = 'P0001'; end if;
  lnk := nullif(trim(coalesce(lnk, '')), '');
  if lnk is not null and lnk !~ '^(/|https://)' then raise exception 'Links start with / (a Hentity page) or https://' using errcode = 'P0001'; end if;
  select count(*) into np from public.bc_audience(aud);
  if np = 0 then raise exception 'Nobody matches this audience' using errcode = 'P0001'; end if;
  insert into push_broadcasts (created_by, title, body, link, audience, mode, people) values (auth.uid(), left(ttl, 120), left(bdy, 300), lnk, aud, mode, np) returning id into bid;
  if mode in ('inapp', 'both') then
    -- type 'announcement' is skipped by the push trigger: the pushes for this go out in batches below
    insert into notifications (user_id, type, grp, title, body, link, actor_id)
    select uid, 'announcement', 'system', public.h_esc(left(ttl, 120)), left(bdy, 300), lnk, auth.uid() from public.bc_audience(aud);
  end if;
  if mode in ('push', 'both') then
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
    for batch in
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
      from (select s.*, (row_number() over (order by s.created_at) - 1) / 20 grp from push_subscriptions s join public.bc_audience(aud) a on a.uid = s.user_id where public.bc_push_ok(s.user_id)) s
      group by s.grp
    loop
      nd := nd + jsonb_array_length(batch);
      perform net.http_post(url := 'https://hentity.com/api/push',
        body := jsonb_build_object('subs', batch, 'title', left(ttl, 120), 'body', left(bdy, 300), 'url', coalesce(lnk, '/notifications'), 'tag', 'broadcast:' || bid, 'bid', bid),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret), timeout_milliseconds := 8000);
    end loop;
    update push_broadcasts set devices = nd where id = bid;
  end if;
  perform public.audit('notifications.broadcast', mode, bid::text, jsonb_build_object('title', ttl, 'people', np, 'devices', nd, 'audience', aud));
  return jsonb_build_object('id', bid, 'people', np, 'devices', nd);
end $$;
