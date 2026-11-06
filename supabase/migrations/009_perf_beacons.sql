-- Real-user page timings (navigation + slowest resources), so slowness can be measured on visitors' own
-- connections instead of guessed. Write-only for visitors; only admins can read.
create table if not exists public.perf_beacons (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text not null check (char_length(path) <= 200),
  data jsonb not null check (octet_length(data::text) <= 12000)
);
alter table public.perf_beacons enable row level security;
create policy "send timings" on public.perf_beacons for insert to anon, authenticated with check (true);
create policy "admins read timings" on public.perf_beacons for select using (public.is_admin());
grant insert on public.perf_beacons to anon, authenticated;
create index if not exists perf_beacons_created_idx on public.perf_beacons (created_at desc);
