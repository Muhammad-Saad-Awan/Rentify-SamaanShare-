# Staging deployment (Stage A6)

**Status: not deployed.** Everything in this document is prepared and waiting on
infrastructure only you can create. Nothing here has been run against a real
staging environment.

Why this matters more than a normal deploy: five phases of code have never run on
serverless. Several behaviours in this codebase are documented as _differing_
between one long-lived process and many short-lived ones, and staging is the only
place to find out whether those documented trade-offs are acceptable. See
[What to verify once it is up](#5-what-to-verify-once-it-is-up) — that section is
the actual point of A6, not the deploy itself.

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
| `DIRECT_URL` | Staging Neon **direct** endpoint (no `-pooler`) | Only needed if you run migrations from CI; PgBouncer cannot serve the session-level statements `prisma migrate` uses. |

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

Four migrations exist. The last three are Stage 4 / Stage A and have only ever
been applied to the dev database.

```
20260728105436_20260728_init
20260803120000_listing_image_public_id_unique
20260811161224_phase4_booking_lifecycle          # Booking timestamps + cancelledBy FK
20260811190342_stage_a_instructions_notification # NotificationType enum value
20260812101707_stage_a2_password_reset_tokens    # PasswordResetToken table
```

**Against a fresh staging database, in order:**

```bash
# 1. Point at staging (use the DIRECT endpoint for migrations)
export DATABASE_URL="<staging-direct-url>"

# 2. Apply schema. `deploy`, never `dev` — `dev` can decide to reset the database.
npx prisma migrate deploy

# 3. Seed the taxonomy. Required: listings cannot be created without it.
npm run db:seed        # 7 categories, 30 subcategories

# 4. Confirm
npx prisma migrate status
```

**Do not run `npm run db:seed:demo`** — see below.

All Stage A migrations are additive (new nullable columns, one new table, one
appended enum value), so there is no destructive step and no rollback plan is
needed beyond restoring the branch.

---

## 4. Pre-deploy code changes still outstanding

Two things `next.config.ts` and the seed explicitly say to remove before launch.
**I have not removed them** — they are load-bearing for local development, and
removing them is a launch decision rather than a Stage A one.

### 4a. `picsum.photos` remote pattern

`next.config.ts:19` allows `picsum.photos` in `images.remotePatterns` purely so
demo-seed listings render. Its own comment says to remove it, and the reason is
real: every host in that list is a host `next/image` will proxy and cache
arbitrary remote images from.

```ts
// next.config.ts — delete this entry before any public deploy
{
  protocol: "https",
  hostname: "picsum.photos",
},
```

### 4b. Demo seed

`prisma/seed-demo.ts` creates fake listings with `picsum.photos` images and is
already guarded to development (`process.env.NODE_ENV`). Never run it against
staging: the two changes go together, since removing the remote pattern leaves
demo listings with broken images.

**Recommendation:** remove 4a and skip 4b for staging, and create two or three
real listings by hand with real Cloudinary uploads. That also exercises the upload
path, which the demo seed bypasses entirely.

Say the word and I will make both changes as a separate commit.

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
| **Password change does not invalidate sessions** | Blocks production | Under the JWT strategy a session is a signed cookie with no server-side record, so a stolen session survives a reset until it expires. Needs a token version on `User` checked in the `jwt` callback. |
| **No CSP** | Should block production | `next.config.ts` explains why: Next injects inline scripts for hydration, so a useful policy needs per-request nonces threaded through middleware. A policy loose enough to work without them provides almost nothing while looking like it does. |
| Rate limiting is in-process | Measure in staging | See 5a. |
| Email verification absent | Not blocking | `emailVerified` exists and is unused; nothing gates on it. Stage C. |
| `registerUser` leaks account existence | Not blocking | Its unique-constraint message confirms a registered email. The fix needs the email transport that now exists — worth doing alongside email verification. |
| Reset-request timing side channel | Accept | The registered path mints a token and waits on Resend; the unregistered path returns immediately. Equalising needs a queue. |
| No error tracking | Should block production | Nothing reports a 500. Everything currently goes to `console.error`. |
| `/forgot-password` is statically prerendered | Cosmetic | The `isEmailEnabled()` gate is therefore evaluated at build time, so adding or removing `RESEND_API_KEY` needs a redeploy to take effect. On Vercel an env change requires a redeploy anyway. |

---

## 7. Order of operations

1. You: create the staging Neon project and the Vercel project (§1).
2. You: start Resend domain verification — longest lead time (§1 item 3).
3. Me: remove `picsum.photos` (§4a) — say the word.
4. You: set environment variables in Vercel (§2).
5. Either: run `migrate deploy` + `db:seed` against staging (§3).
6. Deploy.
7. Both: work through §5. Report anything that fails and I will fix it.
8. Me: create a few real listings with real uploads to exercise Cloudinary.

Once §5 is clean, Stage A is genuinely done and Phase 5 (Reviews) starts.
