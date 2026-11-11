-- One switch for "everything needs approval" vs "publish instantly".
-- site_settings 'approvals' = {"required": true|false}. Missing = required (today's behaviour).
-- When approvals are OFF:
--   * product launches skip the review queue: a picked day = approved & scheduled for that day (past days
--     go to the Directory, as when an admin approves), no day = live today
--   * change requests on live/scheduled products apply straight away
--   * Find roles from startups without a verified product go straight onto the board
--   * suggested new funding listings go live (fixes, which are free-text notes, still wait for an admin)
-- Not affected: page claims (proof of ownership), beta payments (money) and team joins (the founder decides).

insert into public.site_settings (key, value) values ('approvals', '{"required": true}'::jsonb) on conflict (key) do nothing;

create or replace function public.approvals_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> 'required')::boolean from site_settings where key = 'approvals'), true);
$$;
grant execute on function public.approvals_required() to anon, authenticated;

-- Approval steps below can run without an admin when this flag is set inside our own functions
create or replace function public.h_auto_ok() returns boolean language sql stable as $$
  select coalesce(current_setting('hentity.auto_approve', true), '') = 'on';
$$;

-- ---- Products: submitted → approved straight away
create or replace function public.zz_product_auto_approve() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  if new.status = 'review' and (tg_op = 'INSERT' or old.status is distinct from 'review') and not public.approvals_required() then
    if new.launch_date is not null then
      new.status := 'scheduled';
    else
      select id into cur from weeks where starts_at <= now() and ends_at > now() order by id limit 1;
      new.status := 'live'; new.launch_date := public.lagos_today(); new.week_id := coalesce(cur, new.week_id);
    end if;
    new.submitted_at := coalesce(new.submitted_at, now());
    new.reviewed_at := now(); new.review_note := null; new.review_items := '[]'::jsonb;
  end if;
  return new;
end $$;
drop trigger if exists zz_product_auto_approve on public.products;
create trigger zz_product_auto_approve before insert or update of status on public.products
  for each row execute function public.zz_product_auto_approve();

-- ---- Change requests on live products: applied straight away
create or replace function public.product_edit_decide(eid uuid, ok boolean, fields text[] default null, why text default null, keep_verified boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e product_edits; p products; take text[]; c jsonb; k text; st text; who uuid; auto boolean := public.h_auto_ok();
begin
  if not (public.is_admin() or auto) then raise exception 'Admins only'; end if;
  select * into e from product_edits where id = eid for update;
  if e.id is null or e.status <> 'pending' then raise exception 'This request was already handled' using errcode = 'P0001'; end if;
  select * into p from products where id = e.product_id;
  take := case when ok then array(select x from jsonb_object_keys(e.changes) x where fields is null or x = any(fields)) else '{}'::text[] end;
  if ok and cardinality(take) = 0 then raise exception 'Pick at least one change to approve, or reject the request' using errcode = 'P0001'; end if;
  c := e.changes;
  perform set_config('hentity.counter', 'on', true);   -- let these column updates past guard_product
  foreach k in array take loop
    case k
      when 'name' then update products set name = c ->> k where id = p.id;
      when 'tagline' then update products set tagline = c ->> k where id = p.id;
      when 'description' then update products set description = c ->> k where id = p.id;
      when 'website' then update products set website = c ->> k where id = p.id;
      when 'logo_url' then update products set logo_url = nullif(c ->> k, '') where id = p.id;
      when 'color' then update products set color = c ->> k where id = p.id;
      when 'media' then update products set media = c -> k where id = p.id;
      when 'video_url' then update products set video_url = nullif(c ->> k, '') where id = p.id;
      when 'categories' then update products set categories = array(select jsonb_array_elements_text(c -> k)) where id = p.id;
      when 'country' then update products set country = c ->> k, countries = array[c ->> k] where id = p.id;
      when 'city' then update products set city = c ->> k where id = p.id;
      when 'pay_methods' then update products set pay_methods = array(select jsonb_array_elements_text(c -> k)) where id = p.id;
      when 'stage' then update products set stage = c ->> k where id = p.id;
      when 'platforms' then update products set platforms = c ->> k where id = p.id;
      when 'languages' then update products set languages = c ->> k where id = p.id;
      when 'currencies' then update products set currencies = c ->> k where id = p.id;
      when 'registration' then
        update products set verify = case when coalesce(c ->> k, '') = '' then verify - 'company' else verify || jsonb_build_object('company', c ->> k) end,
          verified = case when keep_verified and coalesce(c ->> k, '') <> '' then verified else false end where id = p.id;
        if p.company_id is not null then update companies set registration = nullif(c ->> k, '') where id = p.company_id; end if;
      when 'founder_link' then
        update products set verify = case when coalesce(c ->> k, '') = '' then verify - 'founder' else verify || jsonb_build_object('founder', c ->> k) end where id = p.id;
      else null;
    end case;
  end loop;
  perform set_config('hentity.counter', 'off', true);
  st := case when not ok then 'rejected' when cardinality(take) < (select count(*) from jsonb_object_keys(e.changes)) then 'partial' else 'approved' end;
  update product_edits set status = st, applied = take, admin_note = nullif(trim(coalesce(why, '')), ''), decided_at = now(),
    decided_by = case when public.is_admin() then auth.uid() end where id = eid;
  who := coalesce(e.user_id, p.owner_id);
  if not auto then
    perform public.notify(who, 'product', 'system',
      case st when 'approved' then 'Your changes to ' || p.name || ' are live' when 'partial' then 'Some of your changes to ' || p.name || ' are live' else 'Your changes to ' || p.name || ' weren’t approved' end,
      coalesce(nullif(trim(coalesce(why, '')), ''), case when st = 'rejected' then 'Open the request to see what to change.' else 'Thanks for keeping your page up to date.' end),
      '/products/' || p.slug || '/edit', 'View', auth.uid(), p.id);
  end if;
  perform public.audit('product.edit_' || st || case when auto then '_auto' else '' end, 'product', p.id::text, jsonb_build_object('name', p.name, 'applied', take, 'note', why));
  return jsonb_build_object('status', st, 'applied', take);
end $$;

create or replace function public.product_edit_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and not public.approvals_required() then
    perform set_config('hentity.auto_approve', 'on', true);
    perform public.product_edit_decide(new.id, true);
    perform set_config('hentity.auto_approve', 'off', true);
  end if;
  return null;
end $$;
drop trigger if exists zz_product_edit_auto on public.product_edits;
create trigger zz_product_edit_auto after insert on public.product_edits for each row execute function public.product_edit_auto();

-- ---- Find roles: straight onto the board
create or replace function public.zz_find_role_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'review' and not public.approvals_required() then
    new.status := 'open'; new.approved_at := coalesce(new.approved_at, now()); new.review_note := null;
  end if;
  return new;
end $$;
drop trigger if exists zz_find_role_auto on public.find_roles;
create trigger zz_find_role_auto before insert or update on public.find_roles for each row execute function public.zz_find_role_auto();

-- ---- Funding: a suggested new listing goes live
create or replace function public.fsub_autopublish(sid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s funding_submissions; d jsonb; oid uuid; arr text[];
begin
  select * into s from funding_submissions where id = sid and status = 'pending' and kind = 'new';
  if s.id is null then return null; end if;
  d := s.data;
  insert into funding_opps (mode, kind, name, org, website, apply_url, amount_text, round_note, description, source_url,
    countries, categories, stages, women_only, deadline, contributed_by, checked_at, active)
  values (d ->> 'mode',
    case when d ->> 'kind' in ('grant','prize','competition','vc','angel','accelerator','micro_vc') then d ->> 'kind' when d ->> 'mode' = 'equity' then 'vc' else 'grant' end,
    left(d ->> 'name', 120), coalesce(d ->> 'org', ''), coalesce(d ->> 'website', ''), coalesce(d ->> 'apply_url', ''),
    coalesce(d ->> 'amount_text', ''), coalesce(d ->> 'round_note', ''), coalesce(d ->> 'description', ''), coalesce(d ->> 'source_url', d ->> 'apply_url', ''),
    coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(d -> 'countries') = 'array' then d -> 'countries' else '[]' end)), '{}'),
    coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(d -> 'categories') = 'array' then d -> 'categories' else '[]' end)), '{}'),
    coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(d -> 'stages') = 'array' then d -> 'stages' else '[]' end)), '{}'),
    coalesce((d ->> 'women_only')::boolean, false),
    case when coalesce(d ->> 'deadline', '') ~ '^\d{4}-\d{2}-\d{2}$' then (d ->> 'deadline')::date end,
    s.user_id, current_date, true)
  returning id into oid;
  perform set_config('hentity.auto_approve', 'on', true);
  perform public.fsub_decide(sid, 'approved', oid, '');
  perform set_config('hentity.auto_approve', 'off', true);
  return oid;
exception when others then
  perform set_config('hentity.auto_approve', 'off', true);
  raise warning 'funding auto-publish failed: %', sqlerrm;   -- stays in the admin queue
  return null;
end $$;
revoke execute on function public.fsub_autopublish(uuid), public.h_auto_ok() from public, anon, authenticated;

-- fsub_decide: same as before, but also callable by the auto-publisher
create or replace function public.fsub_decide(sid uuid, st text, opp uuid default null, nt text default '') returns void
language plpgsql security definer set search_path = public as $$
declare s funding_submissions; nm text;
begin
  if not (public.is_admin() or public.h_auto_ok()) then raise exception 'Admins only' using errcode = 'P0001'; end if;
  if st not in ('approved', 'rejected', 'duplicate') then raise exception 'Unknown decision' using errcode = 'P0001'; end if;
  update funding_submissions set status = st, result_opp = coalesce(opp, opp_id), admin_note = left(trim(coalesce(nt, '')), 500), decided_by = case when public.is_admin() then auth.uid() end, decided_at = now()
  where id = sid and status = 'pending' returning * into s;
  if s.id is null then raise exception 'Already decided' using errcode = 'P0001'; end if;
  if st = 'approved' and s.kind = 'new' and opp is not null then
    update funding_opps set contributed_by = s.user_id where id = opp and contributed_by is null;
  end if;
  select name into nm from funding_opps where id = coalesce(opp, s.opp_id);
  nm := coalesce(nm, s.data ->> 'name', 'your suggestion');
  insert into notifications (user_id, type, grp, title, body, link, actor_id)
  values (s.user_id, 'funding_sub', 'system',
    case st when 'approved' then case when s.kind = 'new' then nm || ' is now on Hentity Funding' else 'Thanks: we updated ' || nm end
            when 'duplicate' then nm || ' is already on Hentity' else 'We didn’t add ' || nm end,
    case st when 'approved' then case when s.kind = 'new' then 'Thanks for sharing it. Founders can now find it, and it shows you shared it.' else 'Your fix is live. Thanks for keeping the listings right.' end
            else coalesce(nullif(s.admin_note, ''), case when st = 'duplicate' then 'Someone shared it first. Thanks all the same.' else 'It didn’t meet our listing rules this time. Thanks for sharing.' end) end,
    case when st = 'approved' or st = 'duplicate' then case when coalesce(opp, s.opp_id) is not null then '/funding/' || coalesce(opp, s.opp_id) else '/funding' end else '/funding' end,
    case when public.is_admin() then auth.uid() end);
  insert into audit_log (actor_id, action, target_type, target_id, meta) values (auth.uid(), 'funding_suggestion_' || st, 'funding_submission', sid::text, jsonb_build_object('opp', coalesce(opp, s.opp_id), 'auto', public.h_auto_ok()));
end $$;

create or replace function public.fsub_auto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'new' and new.status = 'pending' and not public.approvals_required() then perform public.fsub_autopublish(new.id); end if;
  return null;
end $$;
drop trigger if exists zz_fsub_auto on public.funding_submissions;
create trigger zz_fsub_auto after insert on public.funding_submissions for each row execute function public.fsub_auto();

-- ---- The switch (full admins). Turning approvals off can also clear everything already waiting.
create or replace function public.approvals_set(req boolean, approve_waiting boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n_prod int := 0; n_edit int := 0; n_role int := 0; n_fund int := 0;
begin
  if not public.is_full_admin() then raise exception 'Only a full admin can change this' using errcode = 'P0001'; end if;
  insert into site_settings (key, value, updated_at) values ('approvals', jsonb_build_object('required', req), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  if not req and approve_waiting then
    for r in select id, launch_date from products where status = 'review' loop
      if r.launch_date is not null then perform public.admin_review(r.id, 'scheduled', null, '[]'::jsonb, null, r.launch_date);
      else perform public.admin_review(r.id, 'live', null); end if;
      n_prod := n_prod + 1;
    end loop;
    for r in select id from product_edits where status = 'pending' loop perform public.product_edit_decide(r.id, true); n_edit := n_edit + 1; end loop;
    for r in select id from find_roles where status = 'review' loop perform public.find_review_role(r.id, true); n_role := n_role + 1; end loop;
    for r in select id from funding_submissions where status = 'pending' and kind = 'new' loop
      if public.fsub_autopublish(r.id) is not null then n_fund := n_fund + 1; end if;
    end loop;
  end if;
  perform public.audit(case when req then 'approvals.on' else 'approvals.off' end, 'site_settings', 'approvals',
    jsonb_build_object('approved', jsonb_build_object('products', n_prod, 'edits', n_edit, 'roles', n_role, 'funding', n_fund)));
  return jsonb_build_object('required', req, 'products', n_prod, 'edits', n_edit, 'roles', n_role, 'funding', n_fund);
end $$;
grant execute on function public.approvals_set(boolean, boolean) to authenticated;
revoke execute on function public.approvals_set(boolean, boolean) from anon;

-- What's waiting right now (for the switch's "approve them too" option)
create or replace function public.approvals_waiting() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then jsonb_build_object(
    'products', (select count(*) from products where status = 'review'),
    'edits', (select count(*) from product_edits where status = 'pending'),
    'roles', (select count(*) from find_roles where status = 'review'),
    'funding', (select count(*) from funding_submissions where status = 'pending' and kind = 'new')) end;
$$;
grant execute on function public.approvals_waiting() to authenticated;
