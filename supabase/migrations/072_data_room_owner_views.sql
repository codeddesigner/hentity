-- Data room: the owner's own visits to their links aren't counted as investor views.
-- Applied in production as 072_data_room_owner_views: adds dr_sessions.is_owner; dr_start sets it,
-- dr_track skips it, dr_files_for returns it as 'owner', dr_my_room leaves it out of link viewer counts.
alter table public.dr_sessions add column if not exists is_owner boolean not null default false;
