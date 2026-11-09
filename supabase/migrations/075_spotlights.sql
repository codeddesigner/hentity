-- Founder spotlights: the super admin sends a founder a short interview; the founder answers privately;
-- the admin edits and publishes it as a story at /spotlight/<slug>, with a News entry pointing to it.
-- Super admin only (role 'admin'): mini-admins can't send, read or publish them.

create table if not exists public.spotlights (
  id uuid primary key default gen_random_uuid(),
  founder_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  intro text not null default '',
  questions jsonb not null default '[]',           -- [{ id, q, hint, optional }]
  answers jsonb not null default '{}',             -- { id: text }, as the founder wrote them
  edits jsonb not null default '{}',               -- { id: text }, the admin's edited version for publishing
  title text not null default '',
  dek text not null default '',
  highlights text[] not null default '{}',
  slug text unique,
  status text not null default 'sent' check (status in ('sent', 'answered', 'published', 'declined', 'withdrawn')),
  consent boolean not null default false,
  due_at timestamptz,
  sent_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  answered_at timestamptz,
  reminded_at timestamptz,
  published_at timestamptz,
  article_id uuid references public.articles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.spotlights enable row level security;   -- reached through the functions below only
create index if not exists spotlights_founder on public.spotlights (founder_id);

create or replace function public.sp_super() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not coalesce(banned, false));
$$;

create or replace function public.sp_row(s spotlights, adm boolean) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(s) - case when adm then '{}'::text[] else array['edits', 'sent_by'] end
    || jsonb_build_object(
      'founder', (select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'headline', u.headline, 'city', u.city, 'country', u.country, 'is_verified', u.is_verified, 'email', case when adm then u.email end) from profiles u where u.id = s.founder_id),
      'product', (select jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'tagline', p.tagline, 'logo_url', p.logo_url, 'color', p.color, 'categories', p.categories, 'city', p.city, 'country', p.country, 'stage', p.stage) from products p where p.id = s.product_id));
$$;

-- ---------------------------------------------------------------- admin
create or replace function public.sp_admin_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sp_super() then raise exception 'Only the super admin can use spotlights' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(public.sp_row(s, true) order by s.created_at desc), '[]') from spotlights s);
end $$;

-- Founders to pick from: people with a live or scheduled product
create or replace function public.sp_founders(qry text default '') returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sp_super() then raise exception 'Only the super admin can use spotlights' using errcode = 'P0001'; end if;
  return (select coalesce(jsonb_agg(x order by x->>'name'), '[]') from (
    select jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name, 'avatar_url', u.avatar_url, 'avatar_color', u.avatar_color, 'city', u.city,
      'products', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'logo_url', p.logo_url, 'color', p.color) order by p.upvote_count desc) from products p where p.owner_id = u.id and p.status in ('live', 'scheduled')),
      'open', exists (select 1 from spotlights s where s.founder_id = u.id and s.status in ('sent', 'answered')),
      'published', exists (select 1 from spotlights s where s.founder_id = u.id and s.status = 'published')) x
    from profiles u where not coalesce(u.banned, false) and exists (select 1 from products p where p.owner_id = u.id and p.status in ('live', 'scheduled'))
      and (coalesce(qry, '') = '' or u.name ilike '%' || qry || '%' or u.username ilike '%' || qry || '%'
        or exists (select 1 from products p where p.owner_id = u.id and p.name ilike '%' || qry || '%'))
    limit 60) z);
end $$;

create or replace function public.sp_email(s spotlights, reminder boolean) returns void language plpgsql security definer set search_path = public as $$
declare who text; prod text; link text := 'https://hentity.com/spotlight/' || s.id; n int := jsonb_array_length(s.questions);
begin
  select split_part(coalesce(nullif(name, ''), username), ' ', 1) into who from profiles where id = s.founder_id;
  select name into prod from products where id = s.product_id;
  perform public.h_email_send(s.founder_id, 'spotlight' || case when reminder then '_remind' else '' end, s.id::text || case when reminder then ':' || extract(epoch from now())::bigint else '' end, null,
    case when reminder then 'A reminder: your Hentity spotlight questions' else 'We’d like to feature ' || coalesce(prod, 'you') || ' on Hentity' end,
    public.h_email_layout('minimal', 'Founder spotlight', case when reminder then 'Your spotlight questions are waiting' else 'We’d like to feature ' || coalesce(prod, 'you') end,
      n || ' short questions about what you’re building. Answer in your own words, at your own pace.',
      '<p style="margin:0 0 14px">Hi ' || public.h_esc(coalesce(who, 'there')) || ',</p>'
      || case when s.intro <> '' then '<p style="margin:0 0 14px;white-space:pre-line">' || public.h_esc(s.intro) || '</p>' else '' end
      || '<p style="margin:0 0 20px">Your answers come only to the Hentity team. We may edit them for length and clarity, and we’ll only publish your spotlight if you say yes.'
      || case when s.due_at is not null then ' If you can, answer by ' || to_char(s.due_at at time zone 'Africa/Lagos', 'FMDD Mon') || '.' else '' end || '</p>'
      || public.h_email_button(link, 'Answer the questions'),
      s.founder_id, 'You’re getting this because the Hentity team invited you to a founder spotlight.', null, null, null, link));
end $$;

create or replace function public.sp_send(founder uuid, pid uuid, intro text, qs jsonb, due timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s spotlights; prod text;
begin
  if not public.sp_super() then raise exception 'Only the super admin can send spotlights' using errcode = 'P0001'; end if;
  if jsonb_typeof(qs) <> 'array' or jsonb_array_length(qs) < 1 then raise exception 'Add at least one question' using errcode = 'P0001'; end if;
  if jsonb_array_length(qs) > 20 then raise exception 'Keep it to 20 questions or fewer' using errcode = 'P0001'; end if;
  if not exists (select 1 from profiles where id = founder and not coalesce(banned, false)) then raise exception 'Founder not found' using errcode = 'P0001'; end if;
  if exists (select 1 from spotlights where founder_id = founder and status in ('sent', 'answered')) then raise exception 'This founder already has open spotlight questions' using errcode = 'P0001'; end if;
  if pid is not null and not exists (select 1 from products where id = pid and owner_id = founder) then pid := null; end if;
  insert into spotlights (founder_id, product_id, intro, questions, due_at, sent_by)
  values (founder, pid, left(trim(coalesce(intro, '')), 2000),
    (select jsonb_agg(jsonb_build_object('id', coalesce(nullif(q ->> 'id', ''), 'q' || o), 'q', left(trim(q ->> 'q'), 300), 'hint', left(trim(coalesce(q ->> 'hint', '')), 300), 'optional', coalesce((q ->> 'optional')::boolean, false)) order by o)
       from jsonb_array_elements(qs) with ordinality j(q, o) where trim(coalesce(q ->> 'q', '')) <> ''), due, auth.uid())
  returning * into s;
  select name into prod from products where id = s.product_id;
  insert into notifications (user_id, type, grp, title, body, link, actor_id)
  values (founder, 'spotlight', 'system', 'We’d like to feature ' || coalesce(prod, 'you') || ' on Hentity', jsonb_array_length(s.questions) || ' short questions from the Hentity team. Your answers are private until you agree to publish.', '/spotlight/' || s.id, auth.uid());
  perform public.sp_email(s, false);
  insert into audit_log (actor_id, action, target_type, target_id, meta) values (auth.uid(), 'spotlight_send', 'profile', founder::text, jsonb_build_object('spotlight', s.id));
  return s.id;
end $$;

create or replace function public.sp_remind(sid uuid) returns void language plpgsql security definer set search_path = public as $$
declare s spotlights;
begin
  if not public.sp_super() then raise exception 'Only the super admin can use spotlights' using errcode = 'P0001'; end if;
  select * into s from spotlights where id = sid;
  if s.id is null or s.status <> 'sent' then raise exception 'Only unanswered spotlights can be reminded' using errcode = 'P0001'; end if;
  if s.reminded_at > now() - interval '24 hours' then raise exception 'You reminded them less than a day ago' using errcode = 'P0001'; end if;
  update spotlights set reminded_at = now() where id = sid;
  insert into notifications (user_id, type, grp, title, body, link) values (s.founder_id, 'spotlight', 'system', 'A reminder: your spotlight questions', 'The Hentity team would love your answers.', '/spotlight/' || s.id);
  perform public.sp_email(s, true);
end $$;

create or replace function public.sp_withdraw(sid uuid) returns void language plpgsql security definer set search_path = public as $$
declare s spotlights;
begin
  if not public.sp_super() then raise exception 'Only the super admin can use spotlights' using errcode = 'P0001'; end if;
  update spotlights set status = 'withdrawn', updated_at = now() where id = sid and status in ('sent', 'answered') returning * into s;
  if s.id is null then raise exception 'Can’t withdraw this one' using errcode = 'P0001'; end if;
end $$;

-- Save the edited story (title, standfirst, highlights, edited answers), without publishing
create or replace function public.sp_save(sid uuid, ttl text, dk text, hl text[], ed jsonb) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.sp_super() then raise exception 'Only the super admin can use spotlights' using errcode = 'P0001'; end if;
  update spotlights set title = left(trim(coalesce(ttl, '')), 140), dek = left(trim(coalesce(dk, '')), 400),
    highlights = array(select left(trim(x), 200) from unnest(coalesce(hl, '{}')) x where trim(x) <> '' limit 5),
    edits = coalesce(ed, '{}'), updated_at = now() where id = sid;
end $$;

create or replace function public.sp_publish(sid uuid, on_ boolean default true) returns text language plpgsql security definer set search_path = public as $$
declare s spotlights; prod products; slg text; aid uuid; u profiles;
begin
  if not public.sp_super() then raise exception 'Only the super admin can publish spotlights' using errcode = 'P0001'; end if;
  select * into s from spotlights where id = sid;
  if s.id is null then raise exception 'Spotlight not found' using errcode = 'P0001'; end if;
  if not on_ then
    update spotlights set status = 'answered', updated_at = now() where id = sid;
    update articles set status = 'draft' where id = s.article_id;
    return s.slug;
  end if;
  if s.status not in ('answered', 'published') then raise exception 'Publish once the founder has answered' using errcode = 'P0001'; end if;
  if not s.consent then raise exception 'The founder hasn’t agreed to publishing' using errcode = 'P0001'; end if;
  if char_length(s.title) < 8 then raise exception 'Add a headline first' using errcode = 'P0001'; end if;
  select * into prod from products where id = s.product_id;
  select * into u from profiles where id = s.founder_id;
  slg := coalesce(s.slug, trim(both '-' from left(regexp_replace(lower(coalesce(u.name, u.username) || '-' || coalesce(prod.name, 'founder')), '[^a-z0-9]+', '-', 'g'), 70)));
  if exists (select 1 from spotlights where slug = slg and id <> sid) then slg := slg || '-' || left(sid::text, 4); end if;
  if s.article_id is null then
    insert into articles (slug, title, dek, bullets, topic, country, source, source_url, source_initials, color, image_url, read_minutes, status, product_ids, published_at, created_by)
    values ('spotlight-' || slg, s.title, s.dek, s.highlights, 'From Hentity', coalesce(prod.country, u.country, 'NG'), 'Hentity spotlight', 'https://hentity.com/spotlight/' || slg, 'H',
      coalesce(prod.color, '#ff5b14'), prod.logo_url, greatest(2, (select ceil(sum(char_length(coalesce(s.edits ->> (q ->> 'id'), s.answers ->> (q ->> 'id'), ''))) / 1100.0)::int from jsonb_array_elements(s.questions) q)),
      'published', case when prod.id is not null then array[prod.id] else '{}' end, now(), auth.uid())
    returning id into aid;
  else
    update articles set title = s.title, dek = s.dek, bullets = s.highlights, status = 'published', published_at = coalesce(published_at, now()) where id = s.article_id;
    aid := s.article_id;
  end if;
  update spotlights set slug = slg, status = 'published', published_at = coalesce(published_at, now()), article_id = aid, updated_at = now() where id = sid;
  if s.published_at is null then
    insert into notifications (user_id, type, grp, title, body, link) values (s.founder_id, 'spotlight', 'system', 'Your spotlight is live', 'Share it with your customers and investors.', '/spotlight/' || slg);
  end if;
  insert into audit_log (actor_id, action, target_type, target_id, meta) values (auth.uid(), 'spotlight_publish', 'profile', s.founder_id::text, jsonb_build_object('spotlight', sid, 'slug', slg));
  return slg;
end $$;

-- ---------------------------------------------------------------- founder
create or replace function public.sp_get(x text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s spotlights; me boolean;
begin
  if x ~ '^[0-9a-f-]{36}$' then select * into s from spotlights where id = x::uuid; end if;
  if s.id is null then select * into s from spotlights where slug = x; end if;
  if s.id is null then return null; end if;
  me := auth.uid() = s.founder_id;
  if public.sp_super() then return public.sp_row(s, true) || jsonb_build_object('mine', me, 'admin', true); end if;
  if me then
    if s.opened_at is null then update spotlights set opened_at = now() where id = s.id; end if;
    if s.status = 'withdrawn' then return jsonb_build_object('id', s.id, 'status', 'withdrawn', 'mine', true); end if;
    return public.sp_row(s, false) || jsonb_build_object('mine', true);
  end if;
  if s.status = 'published' then
    return (public.sp_row(s, false) - array['answers', 'intro', 'consent', 'due_at', 'reminded_at', 'opened_at']) || jsonb_build_object('published_answers',
      (select coalesce(jsonb_object_agg(q ->> 'id', coalesce(nullif(s.edits ->> (q ->> 'id'), ''), s.answers ->> (q ->> 'id'))), '{}') from jsonb_array_elements(s.questions) q));
  end if;
  return null;
end $$;

-- What's waiting for me (shown on the You page and Notifications)
create or replace function public.sp_mine() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'status', status, 'slug', slug, 'created_at', created_at, 'questions', jsonb_array_length(questions)) order by created_at desc), '[]')
  from spotlights where founder_id = auth.uid() and status in ('sent', 'answered', 'published');
$$;

-- Save a draft (submit = false) or send the answers (submit = true)
create or replace function public.sp_answer(sid uuid, ans jsonb, submit boolean default false, ok boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare s spotlights; missing int;
begin
  select * into s from spotlights where id = sid and founder_id = auth.uid();
  if s.id is null then raise exception 'Not found' using errcode = 'P0001'; end if;
  if s.status not in ('sent', 'answered') then raise exception '%', case s.status when 'published' then 'This spotlight is already published. Message the Hentity team to change it.' when 'withdrawn' then 'The Hentity team closed these questions.' else 'These questions are closed.' end using errcode = 'P0001'; end if;
  ans := (select coalesce(jsonb_object_agg(q ->> 'id', left(coalesce(ans ->> (q ->> 'id'), ''), 4000)), '{}') from jsonb_array_elements(s.questions) q);
  if submit then
    select count(*) into missing from jsonb_array_elements(s.questions) q where not coalesce((q ->> 'optional')::boolean, false) and char_length(trim(ans ->> (q ->> 'id'))) < 2;
    if missing > 0 then raise exception '% question% still need an answer', missing, case when missing = 1 then '' else 's' end using errcode = 'P0001'; end if;
    update spotlights set answers = ans, consent = coalesce(ok, false), status = 'answered', answered_at = coalesce(answered_at, now()), updated_at = now() where id = sid;
    insert into notifications (user_id, type, grp, title, body, link, actor_id)
    select u.id, 'spotlight', 'system', (select coalesce(name, username) from profiles where id = s.founder_id) || ' answered your spotlight questions',
      case when ok then 'They’re happy for you to publish it.' else 'They haven’t agreed to publishing yet.' end, '/admin#spotlights/' || s.id, s.founder_id
    from profiles u where u.role = 'admin';
  else
    update spotlights set answers = ans, updated_at = now() where id = sid;
  end if;
end $$;

create or replace function public.sp_decline(sid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update spotlights set status = 'declined', updated_at = now() where id = sid and founder_id = auth.uid() and status = 'sent';
  if not found then raise exception 'Can’t decline this one' using errcode = 'P0001'; end if;
end $$;

revoke execute on function public.sp_row(spotlights, boolean), public.sp_email(spotlights, boolean) from public, anon, authenticated;
grant execute on function public.sp_get(text) to anon, authenticated;
grant execute on function public.sp_admin_list(), public.sp_founders(text), public.sp_send(uuid, uuid, text, jsonb, timestamptz), public.sp_remind(uuid), public.sp_withdraw(uuid),
  public.sp_save(uuid, text, text, text[], jsonb), public.sp_publish(uuid, boolean), public.sp_mine(), public.sp_answer(uuid, jsonb, boolean, boolean), public.sp_decline(uuid), public.sp_super() to authenticated;
revoke execute on function public.sp_admin_list(), public.sp_founders(text), public.sp_send(uuid, uuid, text, jsonb, timestamptz), public.sp_remind(uuid), public.sp_withdraw(uuid),
  public.sp_save(uuid, text, text, text[], jsonb), public.sp_publish(uuid, boolean), public.sp_mine(), public.sp_answer(uuid, jsonb, boolean, boolean), public.sp_decline(uuid) from anon;
