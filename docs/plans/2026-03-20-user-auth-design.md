# User Authentication Design

**Date:** 2026-03-20
**Status:** Approved

## Overview

Add a full multi-user authentication system to Reach. Each user signs up with email and password, gets their own isolated data (outreach records, tracking pixels), and authenticates via JWT. The web dashboard is the login surface; the Chrome/Firefox/Safari extension syncs the token from there.

## Approach

Simple JWT with bcrypt — stateless tokens, no refresh token complexity for now. Uses existing Express + Prisma stack with two new dependencies: `bcrypt` and `jsonwebtoken`.

## Data Model

**New `User` model:**
```prisma
model User {
  id           Int       @id @default(autoincrement())
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  outreaches   Outreach[]
  trackingPixels TrackingPixel[]
}
```

**`Outreach` changes:** add `userId Int`, foreign key to `User`, indexed.

**`TrackingPixel` changes:** add `userId Int`, foreign key to `User`.

`OpenEvent` requires no changes — it links through `TrackingPixel`.

Migration note: existing rows must be cleared or assigned to a seeded user before deploying.

## Auth Endpoints

All under `/api/auth`, exempt from the existing `requireSecret` middleware:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account. Validates email + password (min 8 chars) with zod. Returns 409 if email taken. Hashes with bcrypt (cost 12). Returns JWT. |
| POST | `/api/auth/login` | Verify credentials. Returns 401 on bad email or wrong password. Returns JWT. |
| GET | `/api/auth/me` | Protected. Returns `{ id, email, createdAt }` for the current user. |

**JWT payload:** `{ userId, email }`, signed with `JWT_SECRET`, expires `7d`.

## Middleware

**`middleware/requireAuth.js`** replaces `requireSecret` for all `/api` routes except `/api/auth/*` and tracking routes:

- Reads `Authorization: Bearer <token>` header
- Verifies JWT against `JWT_SECRET`; returns 401 if missing, invalid, or expired
- Attaches `req.user = { userId, email }` to the request

**All existing route handlers** filter by `req.user.userId`:
- `outreach`: all queries scoped to `userId`
- `analytics/insights`: scoped to `userId`
- `email` (find-email, suggest-domains, draft-email): no data stored, no change needed

**Tracking routes** (`/track/:id`) remain unauthenticated — hit by email clients.

**`REACH_SECRET`** and `requireSecret` can be removed; `JWT_SECRET` is the new secret.

## Web Frontend

New dependencies: `react-router-dom`.

**New pages:**
- `/login` — email + password form → `POST /api/auth/login` → store JWT in `localStorage` → redirect to app
- `/signup` — email + password + confirm password → `POST /api/auth/signup` → same flow

**`useAuth` hook:** manages `login(token)`, `logout()`, `getToken()`.

**`PrivateRoute` wrapper:** checks `localStorage` for JWT. If absent, redirects to `/login`. On any 401 from the API, clears token and redirects to `/login`.

Existing `App.jsx` becomes the protected route — minimal structural change.

## Extension Integration

Token stored in `browser.storage.local` (WebExtensions API — works on Chrome, Firefox, Safari).

**Token sync flow:**
1. After web dashboard login, the extension reads the JWT from `localStorage` on the dashboard origin via content script, then saves it to `browser.storage.local`
2. All extension API calls attach `Authorization: Bearer <token>` header
3. On 401 response, clear stored token and show prompt to re-login via dashboard

No separate extension login UI needed for the initial implementation.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for signing JWTs (generate with `npm run generate-secret`) |

`REACH_SECRET` removed.

## Out of Scope (for now)

- Email verification
- Password reset flow
- Refresh tokens / token rotation
- Google OAuth / "Sign in with Google"
- Rate limiting on auth endpoints (can add later)
