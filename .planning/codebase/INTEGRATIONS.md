# External Integrations

**Analysis Date:** 2026-03-12

## APIs & External Services

**Google Services:**
- Gmail API - Email read access for cold outreach detection
  - SDK/Client: Gmail API v1 (`/Users/aaron/Documents/GitHub/reach/extension/background.js` line 3)
  - Auth: OAuth2 with scope `https://www.googleapis.com/auth/gmail.readonly`
  - Usage: Extension reads Gmail messages to auto-detect cold outreach patterns
  - Endpoints: `https://www.googleapis.com/gmail/v1/users/me/*`

- Google Gemini API - AI text generation for email drafts
  - SDK/Client: Fetch-based HTTP calls
  - Auth: API key via GEMINI_KEY env var
  - Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
  - Usage in web: `/Users/aaron/Documents/GitHub/reach/web/src/lib/gemini.js` (email drafts, feedback generation)
  - Usage in server: `/Users/aaron/Documents/GitHub/reach/server/index.js` lines 222-246 (draft endpoint with tool calling)
  - Models: gemini-2.5-flash

**Clearbit:**
- Company/person enrichment API
  - Implementation: Called from extension classifier (`/Users/aaron/Documents/GitHub/reach/extension/classifier.js` has `fetchClearbitCompany` function)
  - Auth: Likely API key-based (configuration location not found in analyzed files)
  - Usage: Domain validation and company metadata extraction in email classification

**Email Verification/SMTP:**
- DNS-based domain validation
  - Implementation: `/Users/aaron/Documents/GitHub/reach/server/index.js` lines 164-184 (MX record and A record resolution)
  - Lookup: Standard DNS resolve operations for domain validation
  - Usage: Domain suggestion endpoint checks if domain has valid mail setup

**Microsoft Outlook:**
- Host permissions configured for Outlook integration
  - Scopes: https://outlook.live.com/*, https://outlook.office.com/*, https://outlook.office365.com/*
  - Status: Currently configured but may be planned for future use (extension primarily targets Gmail)

## Data Storage

**Databases:**
- SQLite
  - Connection: File-based at `./dev.db` (configurable via Prisma)
  - Client: Prisma Client (`@prisma/client` v5)
  - Schema location: `/Users/aaron/Documents/GitHub/reach/server/prisma/schema.prisma`
  - Models:
    - `Outreach` - Cold outreach records with tracking (threadId, company, contact, dates, status, reply tracking)
    - `TrackingPixel` - Email open tracking IDs
    - `OpenEvent` - Log of email opens with user agent and IP

**File Storage:**
- Local filesystem only
  - SQLite database file
  - No S3 or cloud storage integration detected

**Caching:**
- In-memory session map in emailFinder
  - Purpose: Dedup probed emails during session (`/Users/aaron/Documents/GitHub/reach/server/emailFinder.js` line 35: `const probedEmails = new Map()`)
  - Scope: Server session only, not persistent

## Authentication & Identity

**Auth Provider:**
- Custom OAuth2 with Google
  - Implementation: Chrome Identity API for extension (`/Users/aaron/Documents/GitHub/reach/extension/background.js` lines 13-22)
  - Token handling: `getAuthToken()` and retry logic with token refresh
  - Scope: Gmail read-only access
  - Client ID: `530449760318-vhavp4r85uaino5mjdhi5nsrl28mbdph.apps.googleusercontent.com` (in manifest.json)

**Server Auth:**
- Secret-based API protection
  - Mechanism: Custom middleware checking `X-Reach-Secret` header
  - Location: `/Users/aaron/Documents/GitHub/reach/server/index.js` lines 18-24
  - Protected endpoints: `/api/find-email`, `/api/draft-email`, `/api/suggest-domains`
  - Secret stored in: `REACH_SECRET` environment variable
  - Note: No JWT or session-based auth; uses static header validation

## Monitoring & Observability

**Error Tracking:**
- Not detected
- Basic error logging with console.error in key endpoints

**Logs:**
- console.log/console.error in server
  - Example: `/Users/aaron/Documents/GitHub/reach/server/index.js` line 150, 243
  - Startup message on port 3001

## Tracking & Analytics

**Email Open Tracking:**
- Custom tracking pixel implementation
  - Endpoints: `GET /track/:trackingId` (`/Users/aaron/Documents/GitHub/reach/server/index.js` lines 27-46)
  - Pixel: 1x1 transparent GIF (`PIXEL_GIF` buffer, base64 encoded)
  - Data captured: User agent, IP address, timestamp
  - Storage: TrackingPixel and OpenEvent models
  - Cache-Control: `no-store, no-cache, must-revalidate`

**Best Time Analytics:**
- Aggregated hourly reply rate analysis
  - Endpoint: `GET /api/insights/best-time` (lines 61-88)
  - Query: SQLite raw SQL with strftime hourly aggregation
  - Minimum threshold: 20 sent + 5 replies required for analysis
  - Output: Hour-by-hour send/reply counts and reply rates

## CI/CD & Deployment

**Hosting:**
- Not configured
- Intended for local development (localhost:5173 for web, localhost:3001 for API)

**CI Pipeline:**
- Not detected
- No GitHub Actions or CI configuration found

## Environment Configuration

**Required env vars:**

Server (`/Users/aaron/Documents/GitHub/reach/server/.env.example`):
- `GEMINI_KEY` - Google Gemini API key for AI text generation
- `REACH_SECRET` - Static secret for API authentication (X-Reach-Secret header)

Web (`/Users/aaron/Documents/GitHub/reach/web/.env.local`):
- `VITE_GEMINI_API_KEY` - Gemini API key for client-side AI calls

**Secrets location:**
- Server: `.env` file in `/server` directory
- Web: `.env.local` file in `/web` directory (in .gitignore)
- Extension: Hardcoded REACH_SECRET in background.js (line 9) for local dev
- Both .env files should not be committed (listed in .gitignore)

## Webhooks & Callbacks

**Incoming:**
- Not detected

**Outgoing:**
- Email tracking pixel callback embedded in email bodies
  - URL pattern: `http://localhost:3001/track/{trackingId}.gif`
  - Triggered on email open by recipient's mail client loading image
  - No explicit webhook configuration

## Rate Limiting

**API:**
- Not implemented
- All endpoints accessible without rate limiting

## Data Flow - Email Detection & Drafting

1. **Detection:**
   - Extension reads Gmail inbox via Gmail API
   - Classifier analyzes email content for outreach keywords
   - Extracts company/contact info and sends to server

2. **Server Processing:**
   - Validates domain with DNS checks
   - Calls Gemini API for email pattern inference
   - Stores Outreach record in SQLite via Prisma

3. **Drafting:**
   - Web/extension calls `/api/draft-email` with Reach-Secret header
   - Server calls Gemini API with detailed context
   - Response returned to client for display/editing

4. **Tracking:**
   - Tracking pixel ID registered with `/api/track` POST
   - Pixel URL embedded in email
   - When opened, GET request logs open event with context

---

*Integration audit: 2026-03-12*
