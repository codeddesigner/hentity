-- Imported (unclaimed) startups don't inherit the product defaults for stage, languages and platforms.
-- The full function lives in 023_unclaimed.sql (updated in place); this file records that it was re-applied.
update products set stage = '', languages = '', platforms = '' where status = 'unclaimed';
