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

## 4. Offline-first

Promoters can work with no signal at all. Every edit is written to an on-device outbox (IndexedDB) first, then synced:
- the page retries every 20 s, on reconnect and when the app regains focus;
- the service worker replays the outbox with Background Sync even if the app is closed (Chrome/Android);
- the promoter pages are cached on sign-in so the app opens offline; the cache is wiped on sign-out.
A black strip shows how many changes are waiting, and a toast confirms when queued submissions are delivered.
Admin pages need a connection.

## 4b. Reports

Admin → Reports shows a brand × outlet price matrix: brands down the side (grouped by pack size), outlets across the top,
with min/avg/max/spread per row and an outlet price index (100 = network average). Filter by date range, SKU, brand,
region or outlet; switch between latest / average / lowest / highest; export CSV or print to PDF.

## 5. CSV imports (Admin → Outlets / Promoters / SKUs)

Each import dialog shows the expected header columns and offers a template download. Rows with errors are reported and skipped.

## 6. Security

See `SECURITY.md` for the full review. Highlights: `__Host-` HttpOnly SameSite=Strict session cookie, nonce-based CSP,
HSTS, database-backed sign-in rate limiting plus account lockout, per-user session revocation, parameterised queries,
and a security monitor in Admin → Settings. Run `npm audit` before each release.

## 7. Known caveats

- Seed data comes from the design screenshots. Brands hidden behind "+N more" are seeded as **"Placeholder N"** and promoter phones are placeholders (0200000001–0200000012). Replace via the admin pages or CSV import.
- Migrations and seed have run against Neon; the Vercel deployment has not been exercised end-to-end by the author.
- Background Sync is not available on iOS Safari; there the outbox syncs whenever the app is open.
- Importing historical *entries* by CSV is not built.
