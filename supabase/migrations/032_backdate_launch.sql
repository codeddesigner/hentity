-- Makers can pick a launch day in the past (up to a year back), for products that already launched.
-- Future days still open up to 35 days ahead, and every day keeps its 6-spot limit.
create or replace function public.guard_product() returns trigger
language plpgsql security definer set search_path = public as $$
declare taken int; listing boolean;
begin
  new.updated_at := now();
  if public.is_admin() or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid(); new.status := 'draft';
    new.featured := false; new.promoted := false; new.verified := false;
    new.upvote_count := 0; new.comment_count := 0; new.follower_count := 0; new.click_count := 0; new.view_count := 0;
    new.claim := '{}'::jsonb; new.claimed_at := null;
    return new;
  end if;
  if current_setting('hentity.counter', true) = 'on' then return new; end if;
  listing := old.status = 'live' and old.claimed_at is not null and old.week_id is null and old.launch_date is null;
  new.featured := old.featured; new.promoted := old.promoted; new.verified := old.verified;
  new.upvote_count := old.upvote_count; new.comment_count := old.comment_count; new.follower_count := old.follower_count;
  new.click_count := old.click_count; new.view_count := old.view_count; new.owner_id := old.owner_id;
  new.review_note := old.review_note; new.review_items := old.review_items; new.reviewed_at := old.reviewed_at; new.reviewed_by := old.reviewed_by;
  new.claim := old.claim; new.claimed_at := old.claimed_at;
  if new.status <> old.status then
    if not ((old.status in ('draft','changes') and new.status = 'review')
         or (listing and new.status = 'review')
         or (old.status = 'review' and new.status = 'draft')
         or (old.status = 'scheduled' and new.status = 'draft')
         or (old.status in ('draft','changes','rejected') and new.status = 'archived')) then
      raise exception 'Status change % -> % is not allowed', old.status, new.status;
    end if;
    if new.status = 'review' then new.submitted_at := now(); end if;
  elsif old.status in ('review','live') and not listing then
    raise exception 'This product can''t be edited right now';
  elsif old.status = 'unclaimed' then
    raise exception 'Claim this page first';
  elsif old.status = 'scheduled' then
    if new.launch_date is not distinct from old.launch_date then raise exception 'This product can''t be edited right now'; end if;
    if old.launch_date is not null and public.launch_at(old.launch_date) <= now() then raise exception 'You’re already live, so the day can’t change'; end if;
  end if;
  if new.launch_date is not null and new.status in ('review','scheduled') and (new.launch_date is distinct from old.launch_date or new.status <> old.status) then
    if new.launch_date < public.lagos_today() - 365 then raise exception 'DAY_TOO_OLD'; end if;
    if new.launch_date > public.lagos_today() + 35 then raise exception 'DAY_TOO_FAR'; end if;
    select count(*) into taken from products where launch_date = new.launch_date and status in ('review','scheduled','live') and id <> new.id;
    if taken >= public.day_capacity() then raise exception 'DAY_FULL'; end if;
  end if;
  return new;
end $$;
