# MarketLens — Shelf Price Capture

Mobile-first PWA where promoters log shelf prices per outlet, and admins review, edit, export and manage everything.
Next.js 16 (App Router) · React 19 · Tailwind v4 · Drizzle ORM · Neon Postgres · Vercel.

## 1. Setup

1. Create a **Neon** project and copy the pooled connection string.
2. `cp .env.example .env.local` and fill in:
   - `DATABASE_URL` – Neon connection string
   - `SESSION_SECRET` – 32+ random chars (`openssl rand -base64 48`)
   - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` – first admin account
3. `npm install`
4. `npm run db:setup` – runs migrations and seeds outlets, SKUs, brands and promoters.
   Promoter PINs are **printed once** in the console – save them.
   Set `SEED_DEMO=1` to also create demo history for the dashboard.
5. `npm run dev` → http://localhost:3000

## 2. Deploy to Vercel

1. Push the repo, import it in Vercel.
2. Add `DATABASE_URL` and `SESSION_SECRET` as environment variables.
3. Run `npm run db:migrate` once against the production database (locally, with the production `DATABASE_URL`).
4. Deploy. Open on a phone and choose **Add to Home Screen** to install the PWA.

## 3. Sign-in

- Promoters: phone number + PIN. Admins: email + password.
- Accounts lock temporarily after repeated failures. Admins can reset PINs from the Promoters page (the new PIN is shown once).

## 4. Offline behaviour

Entries autosave locally and sync when back online. Submitting while offline queues the submit.
Previously opened capture pages load from cache. Admin pages need a connection.

## 5. CSV imports (Admin → Outlets / Promoters / SKUs)

Each import dialog shows the expected header columns and offers a template download. Rows with errors are reported and skipped.

## 6. Known caveats

- Seed data comes from the design screenshots. Brands hidden behind "+N more" are seeded as **"Placeholder N"** and promoter phones are placeholders (0200000001–0200000012). Replace via the admin pages or CSV import.
- Not yet exercised against a live Neon instance or Vercel (tested on local Postgres via PGlite + Playwright).
- Only per-account lockout; add IP rate limiting (e.g. Vercel Firewall / Upstash) for production.
- Importing historical *entries* by CSV is not built.
