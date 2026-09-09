# Staging deployment (Stage A6)

**Status: deployed on Vercel, against the Neon project `ep-falling-hall-azf5bl71`
(ap-southeast-1).** The database is migrated to all 15 migrations and the taxonomy
is seeded (7 categories, 30 subcategories). It holds **1 user and 0 listings**, so
an empty marketplace is currently the correct output, not a fault.

Why this matters more than a normal deploy: five phases of code have never run on
serverless. Several behaviours in this codebase are documented as _differing_
between one long-lived process and many short-lived ones, and staging is the only
place to find out whether those documented trade-offs are acceptable. See
[What to verify once it is up](#5-what-to-verify-once-it-is-up) — that section is
the actual point of A6, not the deploy itself.

## What has already gone wrong once (9 Sep 2026)

Read §3 before deploying again. **Migrations were not part of the deploy**, so the
schema sat two migrations behind the code for as long as it took someone to notice,
and the whole authenticated half of the app was down. The deploy itself was green
throughout — a build passing tells you nothing about whether the database it will
talk to has the columns the code selects.

---

## 1. What I need from you

| # | Thing | Why | Lead time |
|---|---|---|---|
| 1 | A **separate** Neon project or branch for staging, with pooled + direct connection strings | Stage A ran three migrations against the dev database. Staging must not share it, or a bad migration takes both down and test bookings pollute real data. | Minutes |
| 2 | A Vercel project linked to this repo | | Minutes |
| 3 | A Resend **verified sending domain** | `EMAIL_FROM` currently falls back to `onboarding@resend.dev`, which delivers **only** to the Resend account owner. Password reset is unusable for anyone else until this exists. | **Hours to days (DNS)** |
| 4 | A staging `AUTH_SECRET` — a *different* one from dev | Reusing it means a dev session cookie is valid in staging. | Seconds (`openssl rand -base64 32`) |
| 5 | Decision: Google OAuth in staging? | If yes, add `https://<staging-host>/api/auth/callback/google` as an authorised redirect URI. If no, leave both vars unset — the button and provider disappear cleanly. | Minutes |
| 6 | Decision: Cloudinary — same account as dev, or separate folder? | Same account is fine; uploads are namespaced per user. A separate account keeps staging junk out of production media. | Minutes |

**Start item 3 now.** DNS propagation is the only thing here with a lead time
measured in days, and it blocks the one Stage A feature that cannot be verified
without it.

---

## 2. Environment variables

Set these in Vercel under **Preview** and **Production** as appropriate. A missing
or malformed required value now fails the build with every problem listed at once
(Stage A3, `src/config/env.schema.ts`), so a misconfiguration surfaces at deploy
time rather than as a mystery 500.

### Required — the build fails without these

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Staging Neon **pooled** endpoint (hostname contains `-pooler`) | Must start `postgres://` or `postgresql://`; validated. Use `sslmode=verify-full`, not Neon's default `require` — see `.env.example`. |
| `AUTH_SECRET` | New 32+ char secret | Length is validated. A short secret is a forgeable session cookie. |

### Required in practice for staging

| Variable | Value | Notes |
|---|---|---|
| `AUTH_URL` | `https://<staging-host>` | Optional on Vercel (derived from `VERCEL_URL`), but set it explicitly for a stable preview host. Without a correct value in production mode, Auth.js rejects the `Host` header and **every** `/api/auth/*` request fails with `UntrustedHost` — which presents as sign-in being completely broken rather than as a config error. |
| `NEXT_PUBLIC_APP_URL` | `https://<staging-host>` | Used for canonical URLs, the sitemap, and **the password-reset link**. Deliberately read from config and never from the request's `Host` header, because a reset link must never point at a host an attacker chose. Trailing slashes are stripped for you. |
| `DIRECT_URL` | Staging Neon **direct** endpoint (no `-pooler`) | **Now genuinely required, not optional.** The build runs `prisma migrate deploy` (§3), and PgBouncer cannot serve the session-level statements `prisma migrate` uses — advisory locks and DDL. `prisma.config.ts` falls back to `DATABASE_URL` when this is unset, which on Neon means pointing migrations at the pooler and failing the build. |

### Optional — each degrades honestly when absent

| Variable | If unset |
|---|---|
| `RESEND_API_KEY` | No transactional email. `/forgot-password` **404s** and the login page hides its "Forgot password?" link — deliberately, because a recovery form that accepts an address and silently sends nothing is worse than no form. |
| `EMAIL_FROM` | Falls back to `SamaanShare <onboarding@resend.dev>`, which reaches only the Resend account owner. **Set this once item 3 is done.** Accepts `a@b.com` or `Name <a@b.com>`. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | No Google provider registered, no Google button rendered. |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Everything works except image upload, which throws at the point of use naming the three variables. Listing creation is unusable without them. |

Empty strings count as absent — that is how Vercel's dashboard records a cleared
field, and a blank key would otherwise be sent to the provider as a real
credential.

### Do not set

- `AUTH_TRUST_HOST` — only for self-hosting outside Vercel. Setting it tells
  Auth.js to trust an incoming `Host` header, which the proxy in front must then
  guarantee.
- `ADMIN_EMAIL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TIMEZONE`,
  `NEXT_PUBLIC_DEFAULT_CURRENCY` — read by nothing. Left commented in
  `.env.example` so an existing `.env.local` does not look wrong.

---

## 3. Migrations

**Fifteen migrations exist, and they are applied by the build.** `vercel.json` sets:

```json
{ "buildCommand": "npm run db:migrate:deploy && npm run build" }
```

### Why this is in the build command, and why it must stay there

It was not, and that is the bug that took the site down on 9 Sep 2026.

`build` was bare `next build` and `postinstall` was only `prisma generate`, so
nothing in the deploy path ever touched the database — `db:migrate:deploy` existed
in `package.json` and no caller invoked it. The schema therefore stayed wherever
the last manual run had left it, while `git push` kept shipping code that needed
more. Two migrations behind was enough:

- `20260907162640_stage_a2_session_invalidation` adds `users.tokenVersion`.
- `requireUser()` and `getActiveUser()` (`src/lib/auth/session.ts`) **select that
  column on every protected page render and every write action.**
- Postgres answered `column users.tokenVersion does not exist` (42703), the throw
  escaped the page, and `src/app/(dashboard)/error.tsx` rendered
  "Something went wrong" on `/dashboard`, `/saved`, `/profile`, `/settings` and
  `/listings/new`.

Note the shape of the failure, because it is the reason this belongs in the build
rather than in a runbook step: **the deployment was green.** `next build` compiles
against the generated Prisma client, which is regenerated from `schema.prisma` on
every install and therefore always knows about `tokenVersion`. Nothing at build
time compares the schema to the database. A migration that is merely *documented*
as a deploy step is a migration that gets skipped, and skipping it produces a
healthy-looking deploy serving 500s.

Consequences of coupling them that are worth knowing rather than discovering:

- **A failed migration now fails the deploy**, before the new code is promoted.
  That is the intended trade: a red deploy on the old, working code beats a green
  deploy on a schema that cannot serve it.
- **Preview deployments migrate too.** Any preview pointed at this database will
  apply a feature branch's migrations to it before merge. `deploy` only ever moves
  forward, so this cannot roll anything back, but a branch's migration will
  outlive the branch. Give a preview its own Neon branch if that matters.
- `prisma generate` still runs in `postinstall`, before the build command, so the
  client is in place by the time either half of this runs.

### Applying them by hand

Only needed for a database the deploy does not reach, or to recover one that has
drifted:

```bash
# 1. Point at the target (the DIRECT endpoint — the pooler cannot run migrations)
export DIRECT_URL="<staging-direct-url>"

# 2. Apply schema. `deploy`, never `dev` — `dev` can decide to reset the database.
npx prisma migrate deploy

# 3. Seed the taxonomy. Required: listings cannot be created without it.
npm run db:seed        # 7 categories, 30 subcategories

# 4. Confirm. Read-only, and the fastest way to check a live database's real state.
npx prisma migrate status
```

`prisma migrate status` is the diagnostic to reach for first whenever a deployed
page 500s and the build was clean. It names exactly which migrations the target is
missing.

There is no demo seed to avoid any more — it was removed in §4.

Every migration to date is additive (new nullable columns, new tables, one appended
enum value, and defaults on the non-nullable ones), so there is no destructive step
and no rollback plan is needed beyond restoring the branch. The two applied on
9 Sep were deliberately defaulted — `tokenVersion INTEGER NOT NULL DEFAULT 0`,
matching the `?? 0` on the token side — so applying them signed nobody out.

---

## 4. Pre-deploy code changes — DONE

Both removals `next.config.ts` and the seed called for are made.

### 4a. `picsum.photos` remote pattern — removed

`images.remotePatterns` now contains Cloudinary and nothing else. Every host in
that list is one `next/image` will fetch, proxy and cache arbitrary bytes from on
request, so it is a security boundary rather than a convenience.

Verified: the optimizer returns **400** for a `picsum.photos` URL and **200** for a
Cloudinary one.

### 4b. Demo seed — removed

`prisma/seed-demo.ts` and the `db:seed:demo` script are gone.

### 4c. Demo *rows* still in the dev database — action required locally

Not a deployment concern, but it will bite you the moment you run the app locally.

`next/image` **throws during server render** for an unconfigured host — it does not
fall back to a broken image. So any page rendering a demo listing now returns a
**500**, which is exactly the coupling the old config comment warned about: the
pattern and the data had to go together.

The dev database is entirely demo data — 17 of 17 listings, 3 users, 20 picsum
images, and **no bookings attached to any of them**.

```bash
npm run clean:demo              # dry run: report what would go
npm run clean:demo -- --delete  # remove it
```

Dry run by default, matching `cleanup:uploads`. It only touches rows with the
seed's `demo-` id prefix (real ids are cuids and cannot collide) plus any
`ListingImage` still pointing at picsum, and it **refuses to run** if any booking
is attached — deleting then would destroy real booking history.

Categories and subcategories are left alone; `npm run db:seed` owns those.

**Staging needs none of this** — it starts from an empty database. Create two or
three real listings by hand with real Cloudinary uploads instead, which also
exercises the upload path the demo seed bypassed entirely.

---

## 5. What to verify once it is up

This is the part that matters. Each item below is a documented trade-off that
behaves differently on serverless than it does locally.

### 5a. Rate limiting — the one I would check first

`src/lib/rate-limit.ts` holds its counters **in one instance's memory** and says
so. On Vercel that means:

- The effective limit is `configured limit × live instances`.
- Every cold start resets every window.

Consequences worth measuring rather than assuming:

| Limit | Configured | Risk if multiplied |
|---|---|---|
| `register` | 5/hour per IP | Each attempt costs a bcrypt hash at cost 12 — this is a CPU-exhaustion vector, not just a data one |
| `reset-request-email` | 5/hour per address | Multiplied, this becomes a mailbombing tool aimed at one person |
| `listing-view` dedupe | 1 per 6h per viewer | Over-counts views; cosmetic |

**Check:** hammer `/register` from one IP and count how many get through before
refusal. If it is materially above 5, decide whether to accept it or bring the
Upstash/Vercel KV upgrade forward. Only `rate-limit.ts` changes — every caller
keeps the same signature.

### 5b. Neon cold start (A4)

Locally: first request after idle took ~60s end to end, warm requests 2.7s in dev.
A4 converted six read-only queries off interactive transactions and raised
`maxWait`/`timeout` to 15s.

**Check:** leave staging idle past Neon's scale-to-zero, then load `/` and
`/listings`. Both must return **200**, not a 500 with `P2028`. If they still time
out, the next lever is Neon's minimum compute rather than more application
timeout.

### 5c. Password reset, end to end

Not verified locally — sending real mail was left to you deliberately.

**Check:** request a reset for a real staging account, confirm the email arrives
from the verified domain (not `resend.dev`), click the link, set a password, and
confirm you land signed in. Then click the **same link again** — it must be
refused, since tokens are single-use.

### 5d. viewCount (A5)

Locally verified: 20 concurrent increments all land, and a paused listing is not
countable. **Not** verified is the browser effect actually firing, which needs a
real browser.

**Check:** open a listing as a signed-out visitor or a non-owner, then load the
owner's `/dashboard/listings` — the count must be 1. Reload the listing a few
times; it must **stay** 1 (six-hour dedupe). Then view it as the owner; it must
still be 1.

### 5e. Server Action body limit

`serverActions.bodySizeLimit` is 2mb. Image uploads deliberately go direct to
Cloudinary to avoid it, but confirm a 10-image listing submits.

### 5f. The soft-404 invariant

`AGENTS.md` documents three routes where a `loading.tsx` above a route that can
`notFound()` produced a 200 status for a dead URL. Browsers hide this.

**Check with `curl`, not a browser:**

```bash
curl -o /dev/null -w '%{http_code}\n' https://<host>/listings/does-not-exist       # 404
curl -o /dev/null -w '%{http_code}\n' https://<host>/categories/does-not-exist     # 404
curl -o /dev/null -w '%{http_code}\n' https://<host>/forgot-password               # 200, or 404 if no RESEND_API_KEY
```

### 5g. Re-run the verification scripts against staging

```bash
DATABASE_URL="<staging-pooled-url>" npx tsx scripts/verify-phase4.ts
DATABASE_URL="<staging-pooled-url>" npx tsx scripts/verify-stage-a.ts
```

Both create their own throwaway rows and delete them. The UI script
(`verify-phase4-ui.ts`) points at `localhost:3000` and would need its `BASE`
changed plus the staging `AUTH_SECRET` to mint a session — worth doing, but say so
and I will parameterise it.

---

## 6. Known gaps going into staging

Recorded rather than hidden. None blocks a staging deploy; two should block
production.

| Gap | Severity | Notes |
|---|---|---|
| ~~**Password change does not invalidate sessions**~~ | **Closed** | `users.tokenVersion` plus the `isRevoked()` check in `src/lib/auth/session.ts`. `changePassword` and `resetPassword` increment it and re-authenticate the caller, so the person who changed the password keeps their session and everyone else holding one loses it. Migration `20260907162640_stage_a2_session_invalidation`. |
| **No CSP** | Should block production | `next.config.ts` explains why: Next injects inline scripts for hydration, so a useful policy needs per-request nonces threaded through middleware. A policy loose enough to work without them provides almost nothing while looking like it does. |
| Rate limiting is in-process | Measure in staging | See 5a. |
| Email verification absent | Not blocking | `emailVerified` exists and is unused; nothing gates on it. Stage C. |
| `registerUser` leaks account existence | Not blocking | Its unique-constraint message confirms a registered email. The fix needs the email transport that now exists — worth doing alongside email verification. |
| Reset-request timing side channel | Accept | The registered path mints a token and waits on Resend; the unregistered path returns immediately. Equalising needs a queue. |
| No error tracking | **Should block production — now demonstrated, not theoretical** | Nothing reports a 500; everything goes to `console.error`. The 9 Sep outage (§3) was found because someone clicked `/dashboard`, not because anything alerted. The digest that `(dashboard)/error.tsx` logs is the only trace, and it is only in Vercel's function logs. |
| Functions run far from the database | Measure | Neon is in `ap-southeast-1` (Singapore); Vercel functions default to `iad1` (US East). Every query crosses the Pacific twice, on top of §5b's cold start. `regions: ["sin1"]` in `vercel.json` is the lever — deliberately not set yet, because it should be measured first rather than guessed at. |
| `/forgot-password` is statically prerendered | Cosmetic | The `isEmailEnabled()` gate is therefore evaluated at build time, so adding or removing `RESEND_API_KEY` needs a redeploy to take effect. On Vercel an env change requires a redeploy anyway. |

---

## 7. Order of operations

1. ~~You: create the staging Neon project and the Vercel project (§1).~~ — done.
2. You: start Resend domain verification — longest lead time (§1 item 3). **Still
   outstanding**, and §5c cannot be checked until it lands.
3. ~~Me: remove `picsum.photos`~~ — done (§4).
4. You: set environment variables in Vercel (§2). Two to re-check now:
   **`DIRECT_URL`**, which the build command needs (§2, §3), and the three
   **`CLOUDINARY_*`** vars, without which §8 cannot be done at all.
5. ~~Either: run `migrate deploy` + `db:seed` against staging (§3).~~ — done, and
   now automatic on every deploy (§3).
6. ~~Deploy.~~ — done.
7. Both: work through §5. **Not started.** Report anything that fails and I will fix it.
8. **You or me: create a few real listings with real uploads to exercise Cloudinary.**
   This is the next thing to do. The database has 0 listings, so §5d (viewCount),
   §5e (10-image submit) and §5f (the 404 on a real listing id) are all blocked on
   it, and the marketplace has nothing to show a visitor.

Once §5 is clean, Stage A is genuinely done and Phase 5 (Reviews) starts.
