-- Bootstrap admin is chi@encir.co: signing up with it, or moving an account to it, grants admin.
-- Also keeps profiles.email in step with confirmed email changes.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-zA-Z0-9_]', '', 'g'));
  uname text;
  n int := 0;
begin
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 26);
  uname := base;
  while exists (select 1 from profiles where username = uname) loop
    n := n + 1; uname := base || n;
  end loop;
  insert into profiles (id, username, name, email, role, avatar_url)
  values (new.id, uname,
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', initcap(split_part(new.email,'@',1))),
          new.email,
          case when lower(new.email) = 'chi@encir.co' then 'admin' else 'user' end,
          new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;

create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- the auth email-sync trigger sets this flag for its own update only
  if current_setting('hentity.email_sync', true) = 'on' then return new; end if;
  if not public.is_admin() then
    new.role := old.role; new.is_verified := old.is_verified; new.banned := old.banned; new.is_seed := old.is_seed; new.email := old.email;
    if new.username <> old.username then
      if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
        raise exception 'You can change your username once every 30 days';
      end if;
      new.username_changed_at := now();
    end if;
  end if;
  return new;
end $$;

create or replace function public.sync_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    perform set_config('hentity.email_sync', 'on', true);
    update profiles set email = new.email,
      role = case when lower(new.email) = 'chi@encir.co' then 'admin' else role end
    where id = new.id;
    perform set_config('hentity.email_sync', 'off', true);
  end if;
  return new;
end $$;
revoke execute on function public.sync_user_email() from public, anon, authenticated;
drop trigger if exists sync_user_email on auth.users;
create trigger sync_user_email after update of email on auth.users for each row execute function public.sync_user_email();

-- The Gmail exception was only there for the old bootstrap address.
update site_settings set value = jsonb_set(value, '{exceptions}', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(value->'exceptions') x where lower(x) <> 'encircode@gmail.com'), '[]'::jsonb))
where key = 'signup';
