# Hentity

Discover what’s being built in Africa. A weekly launch board for African products, with chats, news and a full admin console.

Live: https://hentity.vercel.app · Design: Figma “Hentity”

## Stack

- **Frontend:** static HTML/CSS/JS in `src/` (no framework). `build.py` copies it to `public/`, expands the shared `<head>` and adds canonical, Open Graph, Twitter and robots tags to every page.
- **Backend:** Supabase project `sislzikhjapilksictxd` — Postgres with row-level security, passwordless auth (6-digit email codes, work emails only, optional authenticator-app 2FA), storage bucket `media`, and realtime. Schema and logic live in `supabase/migrations/`.
- **Server functions (Vercel, `api/`):**
  - `ssr.js` — server-rendered title, description, canonical, OG/Twitter and JSON-LD for `/products/:slug`, `/makers/:handle` and `/news/:slug`.
  - `sitemap.js` — `/sitemap.xml` with every live product, published article and indexable maker.
  - `badge.js` — `/api/badge?slug=…` embeddable SVG launch badge with live upvotes and rank.

## Pages

| Area | Pages |
| --- | --- |
| Board | `/` (live re-ranking), `/directory`, `/products/:slug`, `/makers/:handle`, `/saved` |
| Chats | `/chats`, `/chats/:channel`, `/chats/dm/:id` — channels, product rooms, DMs, threads, reactions, voice notes with transcripts, typing and presence |
| News | `/news`, `/news/:slug` — topics, morning brief (read aloud), newsletter, story tips, discussion |
| Launch | `/launch`, `/submit`, `/under-review`, `/changes-requested`, `/scheduled`, `/launch-week`, `/launch-recap`, `/my-products` |
| Account | `/signin` and `/signup` (email code), `/welcome`, `/me`, `/notifications`, `/settings/*` |
| Admin | `/admin` — dashboard, review queue, broadcast, products, launch weeks, companies, users, reports, comments, messages, channels, articles, story suggestions, newsletter, site settings, audit log |

## Sign-in

There are no passwords and no Google sign-in. Members enter their **work email** and get a one-time code (the email's link works too). Personal and disposable inboxes (Gmail, Yahoo, Outlook.com, Proton, Mailinator…) are rejected by a database trigger on sign-up and on email change; manage the list under **Admin → Site settings → Sign-up rules**.

## Admin access

Signing up with **encircode@gmail.com** makes that account an admin automatically (trigger `handle_new_user`). It's a Gmail address, so it's listed as an exception to the work-email rule; remove it under Sign-up rules once you have a work-email admin. Admins can promote others under **Admin → Users**.

## Develop

```bash
python3 build.py        # src/ -> public/
python3 dev.py          # http://localhost:4173 with the vercel.json rewrites
OUT=/tmp NODE_PATH=$(npm root -g) node tests/shot.js '[["/","home.png",1440,900,false,true]]'
```

`tests/shot.js` swaps the Supabase client for `tests/mock-supabase.js` + `tests/fixture.json`, so pages can be screenshot offline (any 6-digit code signs in; `000000` simulates a wrong code).

## Privacy

`profiles.email` and `profiles.whatsapp` aren’t readable through the public API. Your own copy comes from `rpc('my_profile')`; admins use `rpc('admin_users')`.
