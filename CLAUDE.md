# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # dev server (Next.js, Turbopack)
npm run build            # production build
npm run lint              # eslint

npm run test              # vitest, watch mode
npm run test:run          # vitest, single run
npx vitest run src/lib/avialability.test.ts   # single test file (note the existing typo in the filename)

npm run db:generate       # drizzle-kit: generate a migration from schema.ts
npm run db:migrate        # drizzle-kit: apply migrations
npm run db:studio         # drizzle-kit: browse the DB
npm run db:seed           # tsx src/db/seed.ts
```

DB access requires `DATABASE_URL` (Postgres) in `.env`; auth requires `AUTH_SECRET`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`; email requires `RESEND_API_KEY`. Booking reminders (`/api/cron/reminders`) require `CRON_SECRET` and an external scheduler hitting that route hourly — see `.env.example`.

## Architecture

Multi-tenant appointment booking app (Next.js App Router). Every tenant (a salon/business) is identified by a slug in the URL: `src/app/[tenant]/...`. There is no middleware-based tenant resolution — each route/query resolves the tenant by looking up `tenants.slug` directly against the DB.

**Layers, top to bottom:**

- `src/app/[tenant]/**` — routes. Public booking flow (`book/`), tenant-scoped admin (`admin/`).
- `src/lib/actions/*` — `"use server"` actions, the only entry point the UI calls into. They own input validation (zod) and re-check everything server-side (tenant/service ownership, slot availability) rather than trusting client-supplied state.
- `src/lib/availability.query.ts` — DB-facing: loads working hours/exceptions/bookings for a tenant+service in one round trip, then delegates the actual math to `availability.ts`.
- `src/lib/availability.ts` — pure functions, no DB access. This is deliberate: timezone/DST/buffer edge cases are covered by vitest without needing Postgres running. Tested in `avialability.test.ts` (filename typo is intentional/existing, don't "fix" it without also updating the vitest command).
- `src/db/schema.ts` — single source of truth for the data model (drizzle-orm, Postgres).
- `src/auth.ts` — NextAuth v5 (beta). Credentials providers check `passwordHash` and gate on `emailVerifiedAt` (both `users` and `customers`). Google's `signIn()` callback has three branches, checked in order: `pending_customer_tenant` cookie → auto-provision a customer for that tenant; `pending_owner_signup` cookie → create a brand-new tenant + owner (self-serve signup, see below); otherwise → invite-only admin login, a `users` row with matching email must already exist.

**Self-serve tenant signup (`/signup`, outside `[tenant]`):**

- `src/lib/actions/tenant-signup.ts` creates the `tenants` + owner `users` rows in one transaction. `src/lib/tenant-slug.ts` validates format and blocks reserved slugs (`api`, `signup`, etc. — anything that could collide with a top-level static route and make a tenant unreachable).
- Email+password owners are unverified until they click the confirmation link (`emailVerificationTokens`, `kind: "admin"`); Google owners are auto-verified (Google already proved the email). Same reasoning as customer verification — see the comment on `customers.emailVerifiedAt`.
- The Google path carries the chosen business name/slug/timezone across the OAuth redirect via the `pending_owner_signup` cookie (client-set, non-httpOnly, short-lived) — the slug is re-validated server-side in the `signIn()` callback since the cookie is client-controlled.
- New tenants go live immediately (no approval step) with an empty admin panel — the existing empty states on the services/staff/schedule pages double as onboarding.

**Multi-tenant invariants to preserve when touching this code:**

- Every query that touches tenant-owned data must filter by `tenantId` (or join through something that does) — see the comments in `booking.ts` and `availability.query.ts` about why `serviceId`/`staffId` alone aren't trusted.
- A logged-in user can belong to only one tenant; the admin layout (`admin/(protected)/layout.tsx`) checks `session.user.tenantId` against the tenant in the URL and redirects if they don't match — don't bypass this check when adding admin routes.
- The `admin/(protected)/` route group exists specifically to keep `admin/login` outside the auth check (avoids a redirect loop). New protected admin pages go inside `(protected)/`; anything that must stay reachable while logged out goes outside it.
- A Postgres error code thrown inside `db.transaction()` ends up on `err.cause.code`, not `err.code` — always check both via `pgErrorCode()` from `src/lib/db-error.ts`, never a raw `(err as {code?:string}).code` check (this broke silently once already, see `tenant-signup.test.ts`).

**Booking domain model (`schema.ts`):**

- `bookings.endAt` includes the service's buffer time; `serviceEndAt` is the real end shown to the customer. The gap between them is cleanup/prep time.
- `serviceName`/`durationMinutes`/`bufferMinutes`/`priceCents` on `bookings` are snapshots taken at booking time — changing a service's price/duration later must not retroactively change existing bookings.
- `staffServices.durationOverride`/`priceOverrideCents` (nullable) override the service's defaults per staff member; `null` means "use the service's value."
- `scheduleExceptions` with `staffId = null` applies to the whole tenant (holidays); per-staff exceptions win over the tenant one, which wins over recurring `workingHours`. Priority order is implemented in `availability.ts`'s `windowsForDay`.
- Availability slot times are half-open intervals `[start, end)`; `zonedToUtc` converts a tenant-local wall-clock time to a UTC instant using its IANA timezone (DST-correct, no hardcoded offset tables).
- Notification attempts (`notifications` table) are append-only — one row per send attempt, never overwritten — so delivery history/debugging doesn't depend on external provider logs.

## Language

Code comments and some domain/db content are in Romanian; identifiers and code are in English. Match the existing language when editing a file rather than translating wholesale.
