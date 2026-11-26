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

## 4c. Location tracking

Promoters are asked to share their location in the field app (a clear notice explains why; the phone's permission
prompt follows). Once allowed, MarketLens records a position at sign-in, whenever prices are typed (at most once a
minute), at submission, and on a heartbeat while the capture screen is open (default every 2 minutes, configurable).
Admins record a sign-in position too. Positions captured offline ride along in the outbox and sync later.

- **Field map** (Admin → Field map): last known position of everyone, freshness colouring, today's trail, battery and
  accuracy, and "Use as outlet pin" to set an outlet's coordinates from where the promoter is standing.
- **Geofence**: a submission further than the radius (default 300 m) from the outlet pin is flagged *away from outlet*
  in Entries, on the dashboard and in the entry's location evidence (mini map of all pings for that capture).
- **Settings**: turn tracking on/off, require a location to submit, radius, heartbeat interval and retention (default 90 days).
- Browsers cannot report location while the app is closed; tracking only runs while MarketLens is open in the foreground.

## 4d. Daily sales

Admin → SKUs & Brands has a **Brands** panel: tap a brand to mark it **Company** (Olam Agri) or Competitor. Only
company brands appear on the promoters' **Sales** tab, where each sale is recorded with its receipt (see 4e). Today's
sales can be adjusted or removed; everything works offline and syncs with the price outbox. Admin → **Sales** shows units and value with period-over-period deltas, charts by day,
pack size, brand, outlet and promoter, every line with the outlet name, and **Export to Excel** (a workbook with the
lines plus summary sheets). The SKU import accepts an optional `type` column (`company` / `competitor`).

## 4e. Receipts and targets

- **Receipts**: every sale is a transaction with its own receipt. On the Sales tab the promoter picks brand and pack
  size, enters units, photographs the receipt (*Photo* opens the camera, *Gallery* picks an existing image) and taps
  *Add sale*. Photos are shrunk on the phone (≤1600 px JPEG, ~150–400 KB), queued offline and uploaded with the
  outbox. Settings → *Require a receipt for every sale* (on by default) blocks sales without one. Admin → Sales
  shows one row per sale with a receipt viewer; the Excel export carries a link per receipt. Images are stored in
  Postgres; at ~300 KB each, 10,000 receipts ≈ 3 GB, so move to object storage (e.g. Vercel Blob) if volume grows.
- **Targets** (Admin → Targets): a month grid of promoters × company brands. Type the units target per brand and the
  incentive paid when the promoter's total is met; *Copy last month*; CSV import (`promoter,brand,units,incentive`,
  promoter by phone or name); Excel export of target vs actual. Promoters see a live target card on the Sales tab
  that recalculates as they type, with the on-pace line, units needed per day and the incentive.

## 5. CSV imports (Admin → Outlets / Promoters / SKUs)

Outlets accept optional `lat,lng` columns. Each import dialog shows the expected header columns and offers a template download. Rows with errors are reported and skipped.

## 6. Security

See `SECURITY.md` for the full review. Highlights: `__Host-` HttpOnly SameSite=Strict session cookie, nonce-based CSP,
HSTS, database-backed sign-in rate limiting plus account lockout, per-user session revocation, parameterised queries,
and a security monitor in Admin → Settings. Run `npm audit` before each release.

## 7. Known caveats

- Seed data comes from the design screenshots. Brands hidden behind "+N more" are seeded as **"Placeholder N"** and promoter phones are placeholders (0200000001–0200000012). Replace via the admin pages or CSV import.
- Migrations and seed have run against Neon; the Vercel deployment has not been exercised end-to-end by the author.
- Background Sync is not available on iOS Safari; there the outbox syncs whenever the app is open.
- Importing historical *entries* by CSV is not built.
