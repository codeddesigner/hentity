# Hentity

Discover what's being built in Africa — a weekly launch board for African products.

Static site built from the Hentity Figma file (Discovery, Account, Launch pages). No framework: plain HTML, one CSS file of design tokens and components, and a small shared runtime (`src/assets/app.js`).

## Develop

```bash
python3 build.py        # src/ -> public/ (expands the shared <head> partial)
npx serve public        # clean URLs, like production
```

Deployed on Vercel (`vercel.json` runs the build and serves `public/`).

Demo sign-in: `ada@ledgerline.app` / `hentity2026` (state is kept in localStorage).
