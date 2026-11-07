# Funder logos (7 Nov 2026)

Grant logos were scraped from each funder's own homepage with pg_net inside Supabase:

1. Map each grant to the organisation's official domain (not the aggregator page it was found on).
2. `net.http_get('https://<domain>/')`, parse `<link rel="...icon...">` tags; prefer apple-touch-icon, then SVG, then the largest `sizes`.
3. Fetch the icon and keep it only if it returns 200 with an `image/*` content type.
4. If the site blocks bots or has no usable icon, fall back to `https://www.google.com/s2/favicons?domain=<domain>&sz=128` (kept only when Google returns 200).

`logo_url` is hot-linked. `FU.logo` draws the funder's initials underneath, so a logo that later fails to load falls back to initials.
Edit or replace any logo in Admin → Funding → Edit → Logo (paste a URL or upload).
