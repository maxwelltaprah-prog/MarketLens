# MarketLens security review

Scope: the MarketLens code base (Next.js 16 on Vercel, Neon Postgres), reviewed and hardened on 4 November 2026.
Method: code review of every route, action and query; automated dependency audit; git-history secret scan; a
Playwright run against a production build that probes headers, CSRF, authorisation, rate limiting and the offline sync
endpoint. Each control below is marked **Verified** (tested in that run) or **Implemented** (in code, not probed).

## Summary

| Area | Status |
|---|---|
| Secrets and configuration | No secrets in the repo or git history; environment validated at boot; seed vars warned in prod. |
| Transport | HTTPS enforced (HSTS 2 years + preload, `upgrade-insecure-requests`); Vercel terminates TLS; Neon uses `sslmode=require`. |
| Sessions | `__Host-` prefixed, HttpOnly, Secure, SameSite=Strict, HS256 JWT with issuer/audience, 12h admin / 14d promoter, per-user revocation. |
| CSRF | SameSite=Strict + Next.js server-action origin check + explicit same-origin guard on the JSON API. |
| XSS | React escaping everywhere, no `dangerouslySetInnerHTML`, nonce-based CSP with `strict-dynamic`, `object-src 'none'`. |
| Injection | 100% parameterised SQL via Drizzle; no `sql.raw`; CSV export neutralises formula injection. |
| AuthZ | Proxy gate on `/admin`, `/capture`, `/api`; every page, action and route re-checks the user against the database. |
| Rate limiting | Per-IP burst limiter in the proxy; database-backed 20/15 min sign-in limit; 5-strike account lockout; per-user limit on sync. |
| Monitoring | Security events (failed/locked/rate-limited sign-ins, blocked CSRF/authz, sync rejects) written to the audit log; 7-day dashboard in Admin → Settings. |
| Dependencies | `npm audit`: 0 vulnerabilities (prod and dev) after pinning esbuild ≥ 0.25 for drizzle-kit. |
| Exposed files | `public/` holds only the service worker, offline page, brand images and `robots.txt` (disallow all). |
| Debug | `poweredByHeader` off, no browser source maps, generic error boundary with a reference id, no stack traces to users. |

## Findings and fixes

### Critical / high (fixed)
1. **No rate limiting on sign-in** → added per-IP database-backed window (holds across serverless instances), per-IP burst limiter in the proxy, and kept the 5-attempt lockout. *Verified: 45 rapid POSTs to `/login` → HTTP 429.*
2. **No Content-Security-Policy** → nonce-based CSP generated per request in the proxy; `/login` and error pages forced dynamic so the nonce applies. *Verified: header present, app loads with zero CSP console violations.*
3. **Session could not be revoked** → added `users.token_version`, embedded in the JWT and checked on every request. Resetting a PIN or deactivating a promoter signs out all their devices immediately. *Implemented.*
4. **Database credential shared in chat** → the Neon connection string was pasted into this conversation. **Action for you: rotate the `neondb_owner` password in the Neon console and update `DATABASE_URL` in Vercel.**

### Medium (fixed)
5. Cookie upgraded from `SameSite=Lax` to `Strict` and to the `__Host-` prefix in production. *Verified.*
6. HSTS, Permissions-Policy, COOP, CORP, X-Robots-Tag added; `Cache-Control: private, no-store` on all authenticated routes. *Verified.*
7. Environment validation at boot (`src/lib/env.ts`): rejects missing/weak `SESSION_SECRET`, non-Postgres URLs, localhost DB on Vercel; warns if seed variables are set in production. *Verified: build refused a weak secret during testing.*
8. New offline sync endpoint (`/api/capture/sync`) guarded by session, role, `Sec-Fetch-Site`/`Origin` check, per-user rate limit, strict Zod schema (≤60 items, ≤400 cells, UUID + date formats), and a user-id match so a queue written by another account on a shared phone is discarded. *Verified: anonymous → 401, cross-origin → 401/403, admin → 401, promoter same-origin → 200.*
9. `sql.raw` for the lockout interval replaced with a parameterised `make_interval`. *Implemented.*
10. Dev-only esbuild advisory (GHSA-67mh-4wv8-2f99) via drizzle-kit → pinned with an npm override; audit clean. *Verified.*

### Low / informational
11. The GitHub repository `maxwelltraprah-prog/MarketLens` is **public**. The code contains no secrets, but make it private (Settings → Danger Zone).
12. Promoter PINs are 4–8 digits. With the lockout and IP limits this gives an attacker at most ~25 guesses per 15 minutes per IP; acceptable for field use, but prefer 6+ digit PINs (the seed issues 6).
13. The in-memory burst limiter is per serverless instance; the database-backed limit is the authoritative one for sign-in. For stronger DDoS protection enable Vercel's WAF / Attack Challenge Mode (one toggle in the project's Firewall tab).
14. Service-worker page cache stores rendered promoter pages on the device. It is wiped on sign-out. Device-level security (screen lock) remains the user's responsibility.
15. CORS: no `Access-Control-Allow-*` headers are ever sent, so browsers block all cross-origin reads by default; the API additionally rejects cross-site requests outright.

## Location data (added 4 Nov 2026)
- Collected only after an explicit in-app notice and the browser's own permission prompt; a header indicator shows when sharing is on.
- Stored in `location_pings` with the user, kind of event, accuracy, device battery/speed when available, the request IP and user agent; pruned automatically after the configured retention period (default 90 days).
- Written only through authenticated same-origin endpoints (`/api/location`, `/api/capture/sync`), validated with strict schemas and rate limited per user.
- Readable by administrators only (field map, entry evidence). No third-party service receives coordinates; map tiles are fetched from OpenStreetMap without any user data in the request.
- `Permissions-Policy` now allows `geolocation=(self)` so the app itself can read GPS; it remains blocked for any embedded content.
- Recommendation: tell promoters in writing that location is recorded while the app is open, and keep retention at the minimum your audit needs.

## Operational checklist
- [ ] Rotate the Neon password; update `DATABASE_URL` in Vercel.
- [ ] Make the GitHub repository private.
- [ ] Confirm only `DATABASE_URL` and `SESSION_SECRET` are set in Vercel (no `SEED_*`).
- [ ] Enable Vercel Firewall → Attack Challenge Mode if the app is exposed beyond your team.
- [ ] Review Admin → Settings → Security monitor weekly.
