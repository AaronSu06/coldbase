# Codebase Concerns

**Analysis Date:** 2026-03-12

## Security Issues

**Hardcoded API Secret:**
- Issue: REACH_SECRET hardcoded directly in source code
- Files: `extension/background.js` (line 9: `'f824a42ea02d149b28f96141068bc71538e3321f18b2c4cc'`)
- Impact: Secret is exposed in version control and distributed with extension. Any user can impersonate the backend or forge requests
- Fix approach: Move to environment variables; rotate the compromised secret; use OAuth2 or JWT tokens instead of shared secrets

**Hardcoded API Endpoints:**
- Issue: localhost hardcoded throughout extension and web app
- Files:
  - `extension/background.js` lines 5-6
  - `extension/panel.js` lines 11-12
  - `extension/sidebar.js` lines 5-6
  - `web/src/lib/api.js` line 1
  - `extension/popup.js` line 1
- Impact: Development endpoints cannot be changed without code modification. No support for production deploys
- Fix approach: Read endpoints from environment variables or dynamic config endpoint

**No Input Validation on Server:**
- Issue: Server patches directly accept any JSON body without validation
- Files: `server/index.js` lines 116-129 (PATCH /api/outreach/:threadId) and 103-113 (POST /api/outreach)
- Impact: Clients can inject arbitrary data into database; no schema enforcement
- Fix approach: Use Zod/Joi validation middleware like already done in emailFinder.js

**Unprotected Tracking Pixel Endpoint:**
- Issue: GET /track/:trackingId has no authentication, leaks user info
- Files: `server/index.js` lines 27-46
- Impact: Any user can trigger open events and collect IP/user-agent data for arbitrary threadIds
- Fix approach: Require secret header or time-bound token validation

**Missing CORS Restrictions:**
- Issue: `cors()` with no configuration enables all origins
- Files: `server/index.js` line 13
- Impact: Any website can make requests to API; cross-site request forgery possible
- Fix approach: Configure CORS with specific allowed origins: `cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') })`

**Database Exposed to Root:**
- Issue: dev.db appears in both root and server directory; no .gitignore entry for production DB
- Files: `/dev.db` (0B, uncommitted), `server/dev.db` (44KB)
- Impact: Production database would be committed to git if path changes
- Fix approach: Add `*.db` to .gitignore; use explicit DATABASE_URL env var only

## Tech Debt

**Large Monolithic Files:**
- Files:
  - `extension/content.js` (1,414 lines) - Email detection, compose widget, tracking all mixed
  - `extension/background.js` (567 lines) - Auth, API, reply checking all mixed
  - `web/src/components/Sidebar.jsx` (645 lines) - Card details, feedback, actions all mixed
  - `server/emailFinder.js` (380 lines) - SMTP probing, Gemini integration, validation all mixed
- Impact: Difficult to test, maintain, or reuse components; high coupling between concerns
- Fix approach: Split by concern (e.g., `extension/emailDetector.js`, `extension/trackingManager.js`, `extension/auth.js`)

**Console Logging Left in Production Code:**
- Files with console output:
  - `extension/content.js` - 50+ console.log calls
  - `extension/background.js` - 30+ console.log calls
  - `server/index.js` - 2 console.log calls
  - `server/emailFinder.js` - minimal logging
  - `web/src/hooks/useOutreach.js` - error logging only
- Impact: Verbose logs in user browser; potential info leak of email addresses, domains, status
- Fix approach: Create logging module with log level (debug/info/error); remove verbose logs in production

**Overly Permissive Error Handling:**
- Files:
  - `extension/content.js` lines 374-376: `catch { }` swallows all errors silently
  - `server/index.js` lines 38, 40-42: `.catch(() => {})` silently ignores write failures
  - `web/src/lib/api.js` line 12: `.catch(() => '')` swallows network errors
- Impact: Silent failures mask bugs and data loss (e.g., reply updates not saved); hard to debug
- Fix approach: Log all errors; distinguish between user-facing and internal errors; retry failed DB writes

**No Rate Limiting:**
- Issue: `/api/find-email` and `/api/draft-email` can be called unlimited times
- Files: `server/index.js` lines 144-246
- Impact: Abuse risk; expensive Gemini API calls unmetered; DOS attack surface
- Fix approach: Add rate limiter middleware (e.g., `express-rate-limit`); track per-IP or session

**Unreliable Reply Detection:**
- Issue: Reply check logic depends on fragile message count + snippet format
- Files: `extension/background.js` lines 329-376
- Impact: Self-sent follow-ups may incorrectly trigger reply status; conversation preview may become stale
- Fix approach: Add hash/etag tracking; improve snippet validation; add test suite

**Manual State Management in useOutreach:**
- Issue: Complex optimistic updates with manual reversion fallback
- Files: `web/src/hooks/useOutreach.js` lines 43-114
- Impact: Easy to leave UI in inconsistent state; race conditions if server rejects update
- Fix approach: Use mutation library (React Query, SWR) with built-in rollback

## Performance Concerns

**Inefficient Conversation Parsing:**
- Issue: Thread parsing splits on `\n\n` and searches multiple patterns
- Files: `web/src/components/Sidebar.jsx` lines 67-93; `extension/background.js` lines 129-145
- Impact: O(n) parsing on every component mount; repeated for same thread data
- Fix approach: Cache parsed conversations in record object; parse once on fetch

**Missing Pagination:**
- Issue: `/api/outreach` returns entire record set
- Files: `server/index.js` lines 91-100; `extension/background.js` lines 310-378
- Impact: Slow load times as user adds more emails; inefficient bandwidth
- Fix approach: Add `limit` and `offset` query params; paginate UI table at 50 items

**Blocking SMTP Probes:**
- Issue: SMTP checking waits sequentially for each email candidate
- Files: `server/emailFinder.js` lines 1-250+
- Impact: Request hangs if mail server is slow; timeout blocks thread
- Fix approach: Run probes in parallel; implement request timeout (currently 8s); queue them async

**Unused Polling Fallback:**
- Issue: useOutreach sets 5-minute polling interval as "safety-net only"
- Files: `web/src/hooks/useOutreach.js` lines 31
- Impact: Unnecessary API calls every 5 minutes; wastes bandwidth
- Fix approach: Remove polling; rely on visibility-based refresh only (already implemented in App.jsx)

**Unused Sidebar State:**
- Issue: Sidebar has 10+ useState hooks tracking UI state that could be derived
- Files: `web/src/components/Sidebar.jsx` lines 186-195
- Impact: Extra re-renders; difficult to manage state coherence
- Fix approach: Move UI state to parent or use callback lifting

## Fragile Areas

**Email Address Parsing:**
- Files: `extension/background.js` lines 104-107 (regex-based extraction); `classifier.js` lines 168-172
- Why fragile: Regex assumes RFC 5322 is simple; doesn't handle quoted strings, comments, or encoded words
- Safe modification: Use email parsing library (e.g., `email-addresses` npm package)
- Test coverage: No explicit tests for edge cases (quoted names, encoded addresses)

**Company Name Extraction:**
- Files: `classifier.js` lines 109-151 (multiple pattern-based approaches)
- Why fragile: Heuristic matching breaks with non-English company names or unusual formats
- Safe modification: Add fallback to Clearbit (already done); log mismatches for training
- Test coverage: Minimal; relies on keyword matching

**SMTP Verification Logic:**
- Files: `server/emailFinder.js` lines 112-200+ (socket-based SMTP probing)
- Why fragile: Hardcoded port fallback (25→587); assumes standard SMTP responses; timeout handling is complex
- Safe modification: Test against major mail providers first; add explicit state machine
- Test coverage: No tests; relies on real SMTP connections

**Chrome Extension Content Script Injection:**
- Files: `extension/background.js` lines 416-433 (retry logic on tab.sendMessage failure)
- Why fragile: Assumes specific error messages; page-level script may conflict with other extensions
- Safe modification: Use `documentStart` timing; add conflict detection
- Test coverage: Manual testing only

**Message Snippet Stale Detection:**
- Files: `extension/background.js` lines 331-335 (checks for `\n\n` or `[OUT]/[IN]` markers)
- Why fragile: Markers may be removed by email client; check logic is brittle
- Safe modification: Add timestamp comparison; regenerate snippet on every reply check
- Test coverage: No tests for edge cases

## Scaling Limits

**Single Database File:**
- Issue: SQLite dev.db used for production-like scenarios
- Files: `server/prisma/schema.prisma` line 7; `server/dev.db` (44KB)
- Current capacity: ~10,000 records before noticeable slowdown
- Limit: Concurrent write conflicts; no connection pooling
- Scaling path: Migrate to PostgreSQL; add connection pooling (pgBouncer); add indices on `threadId`, `status`, `sentDate`

**Synchronous SMTP Probes:**
- Issue: Email finder blocks request while testing 10+ TLDS × ports
- Current capacity: ~2-3 concurrent requests before timeout (8s limit)
- Limit: Request timeout exceeded; user sees "all_invalid"
- Scaling path: Queue probes async; cache results; pre-test common TLDs

**Single Server Process:**
- Issue: No clustering or load balancing
- Current capacity: ~50 concurrent requests before noticeable slowdown
- Limit: One JS thread; no request queuing
- Scaling path: Use PM2 cluster mode; add nginx; implement request queue (Bull.js)

**No Caching Layer:**
- Issue: `/api/suggest-domains` does DNS lookups every request; no Redis
- Current capacity: ~10 requests/sec before DNS resolver exhaustion
- Limit: DNS query limits per host
- Scaling path: Add Redis caching (TTL 24h); batch DNS queries

## Missing Critical Features

**No Audit Log:**
- Problem: No record of who changed status, deleted records, or accessed tracking pixels
- Blocks: Compliance requirements; debugging user issues; detecting abuse
- Files affected: All API endpoints (`server/index.js`)

**No Undo/History:**
- Problem: Once a record is deleted or status changed, no way to recover or see change timeline
- Blocks: User error recovery; tracking modifications
- Files affected: `web/src/hooks/useOutreach.js` (deleteRecord)

**No Data Export/Backup:**
- Problem: No way to export all tracking data or backup database
- Blocks: User data portability; disaster recovery
- Files affected: App-level; missing endpoint

**No Search Beyond Company/Contact/Subject:**
- Problem: Users cannot search by domain, status transition date, or reply rate
- Blocks: Advanced analytics workflows
- Files affected: `web/src/App.jsx` lines 109-124

**No Gemini Error Handling for Rate Limits:**
- Problem: Gemini API errors (quota exceeded, 429) not distinguished from network errors
- Blocks: Graceful degradation when API quota exhausted
- Files affected: `server/emailFinder.js` lines 45-98; `server/index.js` lines 222-246

**No Test Suite:**
- Problem: Zero automated tests; all testing manual
- Blocks: Confident refactoring; regression detection
- Impact: High (all files)

## Database Schema Issues

**No Foreign Key Constraints:**
- Issue: OpenEvent.trackingId references TrackingPixel.trackingId but no constraint
- Files: `server/prisma/schema.prisma` lines 46-52
- Impact: Orphaned records accumulate; data integrity not enforced at DB level
- Fix approach: Add `@relation` and `onDelete: Cascade`

**No Indices:**
- Issue: Prisma schema has no `@@index` directives for common queries
- Files: `server/prisma/schema.prisma`
- Impact: Slow queries on `status`, `sentDate`, `archived` as data grows
- Fix approach: Add indices on frequently filtered columns: `@@index([status])`, `@@index([sentDate])`, `@@index([archived])`

**AI Suggestion Fields Unused:**
- Issue: `aiSuggestion` and `draft` fields in Outreach model never populated
- Files: `server/prisma/schema.prisma` lines 29-30
- Impact: Schema bloat; misleading fields
- Fix approach: Remove or integrate into actual feedback/draft generation

## Known Bugs

**Token Expiry Causes Silent Failure:**
- Symptoms: Gmail API stops returning data; extension logs show "[Reach] Token expired" but user sees no error
- Files: `extension/background.js` lines 46-55 (TOKEN_EXPIRED handling)
- Trigger: Run extension for >1 hour; token naturally expires
- Workaround: Manually refresh extension or restart browser

**Reply Detection Misses Self-Sent Follow-ups:**
- Symptoms: User sends follow-up email; extension marks thread as "Replied" even though it was sent by them
- Files: `extension/background.js` lines 366-372 (checks labelIds for SENT)
- Trigger: Send self follow-up after reply arrives
- Workaround: Manually revert status to "Sent"

**Company Name Extraction Fails on Bracket Format:**
- Symptoms: Subject "[Stripe] Internship" incorrectly extracts "Stripe]" instead of "Stripe"
- Files: `classifier.js` line 118 (bracket regex)
- Trigger: Use [Company] format in subject
- Workaround: Use "Company -" or "- Company" format instead

**Empty DB Files in Root:**
- Symptoms: `/dev.db` (0B empty file) appears in root directory alongside `/server/dev.db` (real DB)
- Files: `/dev.db`, `server/dev.db`
- Trigger: Git status shows uncommitted dev.db
- Workaround: Run `rm /dev.db`; add `dev.db` to `.gitignore`

**Favicon Fetch from Google on Every Domain Suggestion:**
- Symptoms: Browser makes external request to google.com/s2/favicons for each domain result
- Files: `extension/content.js` lines 996-1009 (favicon loading in Find tab)
- Trigger: Type company name in Find Contacts tab
- Workaround: None; fallback to avatar works but is slower

**Conversation Preview Truncates at 120 Characters:**
- Symptoms: Long conversations cut off; context lost in sidebar
- Files: `extension/background.js` line 345 (hardcoded slice(0, 120))
- Trigger: View long thread in sidebar
- Workaround: Click Gmail URL to see full conversation

## Testing Gaps

**No Unit Tests:**
- What's not tested: All utility functions (classifier.js parsing, date formatting, HTML escaping)
- Files: `classifier.js`, `extension/background.js` (utility section), `web/src/lib/utils.js`
- Risk: Regressions in date/name/email parsing break silently; edge cases untested
- Priority: High (classification logic is critical)

**No Integration Tests:**
- What's not tested: End-to-end flows (send email → detect → track → update reply status)
- Files: All files in chain
- Risk: Individual pieces work but integration breaks; hard to diagnose
- Priority: Medium

**No E2E Tests:**
- What's not tested: Real Chrome extension behavior, Gmail API integration
- Files: `extension/*.js`, interactions with Gmail UI
- Risk: UI changes break extension without warning
- Priority: Medium

**Classifier Edge Cases Untested:**
- What's not tested: Non-English keywords, malformed emails, HTML-only messages, forwarded emails
- Files: `classifier.js` lines 24-90
- Risk: False positives/negatives in classification
- Priority: High

**SMTP Probe Edge Cases Untested:**
- What's not tested: Greylisting, rate limiting, unusual SMTP responses, IPv6
- Files: `server/emailFinder.js` lines 112-200+
- Risk: Email finder returns incorrect results
- Priority: Medium

---

*Concerns audit: 2026-03-12*
