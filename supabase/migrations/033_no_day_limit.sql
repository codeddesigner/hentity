-- No daily limit on launches: any number of startups can launch on the same day.
create or replace function public.day_capacity() returns int language sql immutable as $$ select 1000000 $$;
