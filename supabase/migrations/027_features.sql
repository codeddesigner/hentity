-- Feature switches. Admins turn features off from Admin -> Features. The switches live in
-- site_settings.features as {"key": false, ...}; a missing key means the feature is on.
-- The site hides turned-off features, and these triggers stop anyone but admins from using them
-- through the API, so a switch works even if someone calls the database directly.

insert into public.site_settings (key, value) values ('features', '{}'::jsonb) on conflict (key) do nothing;

create or replace function public.feature_on(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value ->> k)::boolean from site_settings where key = 'features'), true);
$$;
grant execute on function public.feature_on(text) to anon, authenticated;

create or replace function public.guard_feature() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text := tg_argv[0];
begin
  if not public.feature_on(k) and not public.is_admin() then
    raise exception '% is turned off right now', coalesce(tg_argv[1], k) using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists feature_validate on public.idea_checks;
create trigger feature_validate before insert on public.idea_checks for each row execute function public.guard_feature('validate', 'Validate an idea');
drop trigger if exists feature_chats on public.messages;
create trigger feature_chats before insert on public.messages for each row execute function public.guard_feature('chats', 'Chats');
drop trigger if exists feature_comments on public.comments;
create trigger feature_comments before insert on public.comments for each row execute function public.guard_feature('comments', 'Comments');
drop trigger if exists feature_upvotes on public.upvotes;
create trigger feature_upvotes before insert on public.upvotes for each row execute function public.guard_feature('upvotes', 'Upvoting');
drop trigger if exists feature_studio on public.betas;
create trigger feature_studio before insert on public.betas for each row execute function public.guard_feature('studio', 'Beta tests');
drop trigger if exists feature_beta_apply on public.beta_applications;
create trigger feature_beta_apply before insert on public.beta_applications for each row execute function public.guard_feature('studio', 'Beta tests');
drop trigger if exists feature_submit on public.products;
create trigger feature_submit before insert on public.products for each row execute function public.guard_feature('submissions', 'Submitting products');
drop trigger if exists feature_claims on public.claims;
create trigger feature_claims before insert on public.claims for each row execute function public.guard_feature('claims', 'Claiming profiles');
drop trigger if exists feature_suggest on public.story_suggestions;
create trigger feature_suggest before insert on public.story_suggestions for each row execute function public.guard_feature('news', 'News');
