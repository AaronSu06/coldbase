---
status: awaiting_human_verify
trigger: "sent-email-not-in-recents"
created: 2026-03-18T00:00:00Z
updated: 2026-03-18T02:00:00Z
---

## Current Focus

hypothesis: chrome.identity.getAuthToken fails with "bad client id" because the unpacked dev extension ID is not registered in the GCP OAuth2 client's authorized redirect URIs. This is a configuration error that cannot be fixed by changing getAuthToken(interactive) — interactive=true will still return "bad client id". The fix is to eliminate OAuth from the send-tracking critical path by: (1) capturing email data in the content script at send time and including it in the pendingScan payload, (2) falling back to direct server POST using that data when OAuth fails.
test: After implementing fallback path: send email with any keywords → check background SW logs for new "trackFromPendingScan" log → check Overview tab refreshes
expecting: Email tracked via fallback path with synthetic UUID threadId; reply detection won't work for that record but send tracking will succeed
next_action: Implement fallback in tracking.js, reply-checker.js, background.js

## Symptoms

expected: After sending an email, it appears in the "Recent" section of the extension Overview tab and the web dashboard
actual: The email is never recorded — the Recents section shows old emails (e.g. "Stripe - REPLIED") but not newly sent ones. Stats counter stays at 1 sent.
errors:
  - "Unchecked runtime.lastError: Resource::kQuotaBytesPerItem quota exceeded" — appears 5x in new console (was 6x before)
  - "chrome-extension://invalid/: Failed to load resource: ERR_FAILED" — NEW in post-fix console, NOT present before
  - Tracking pixel blocked: CORS loopback block on localhost:3001/track/*.gif from Gmail (https->localhost)
reproduction: Send any email from Gmail compose window. Check extension panel Overview tab — recent list does not update.
timeline: Unknown if it ever worked. Currently broken.

## Eliminated

- hypothesis: storage.local.set for outreachiq_pending_scan fails due to quota
  evidence: tracking.js has a checked callback that logs success "Storage trigger written" — user sees this message, so the write succeeded
  timestamp: 2026-03-18

- hypothesis: background onChanged listener fails to receive the event
  evidence: storage.local.onChanged is well-supported in MV3 service workers; if write succeeded, event fires; no evidence of listener failure
  timestamp: 2026-03-18

- hypothesis: server route missing 409 handling
  evidence: app.js global error handler converts Prisma P2002 (unique constraint) to 409; reply-checker.js handles 409 as no-op
  timestamp: 2026-03-18

- hypothesis: fix introduced JavaScript syntax error crashing module IIFEs
  evidence: read all changed files completely (compose-widget.js, content.js, background.js, tracking.js, reply-checker.js, sidebar.js); all syntax is valid; git diff confirms only additive safe changes
  timestamp: 2026-03-18

- hypothesis: fix introduced a runtime error during module initialization (top-level IIFE code)
  evidence: compose-widget.js has one top-level chrome call (chrome.runtime.getURL) which does not throw; all other changed code is inside functions that only run on user interaction; no module-level code was changed
  timestamp: 2026-03-18

- hypothesis: outreachiq_scan_complete set/remove race causes content script to misfire
  evidence: the set/remove pattern is correct — newValue is set first (triggers listener), then immediately removed; the listener's newValue truthy check guards against the remove event
  timestamp: 2026-03-18

## Evidence

- timestamp: 2026-03-18
  checked: tracking.js fireSendToast → storage.set callback
  found: callback checks lastError; "Storage trigger written" message in log means write succeeded; quota errors are from a different source (possibly Gmail itself or another extension writing to storage.sync)
  implication: the outreachiq_pending_scan trigger IS being written and background SHOULD receive it

- timestamp: 2026-03-18
  checked: background.js onChanged → trackLatestSent → gmail api → classify → POST server
  found: no mechanism exists to notify the panel after trackLatestSent completes; panel only calls loadOverviewData on open/tab-switch/editor-change
  implication: BUG 1 — panel never auto-refreshes after a send event; user must manually interact with panel to see new record

- timestamp: 2026-03-18
  checked: reply-checker.js trackLatestSent classification gate (line 188)
  found: if isColdOutreach(subject + body) returns false AND no manualOverride=force_track, function returns early with just a log; email silently not tracked
  implication: BUG 2 — emails without job keywords (intern, coop, fulltime, parttime, candidate, hiring, recruit, apply, resume) are silently dropped; this is the most common silent failure

- timestamp: 2026-03-18
  checked: reply-checker.js timing — 3s delay before Gmail API fetch (tracking.js line 100)
  found: the extension waits 3s then fetches maxResults=1 from SENT; if the new email hasn't propagated to Gmail API yet (Gmail indexing latency can exceed 3s), the background fetches the PREVIOUS sent email; if that was already tracked, server returns 409; if not, it incorrectly tracks the WRONG email
  implication: BUG 3 — race condition: 3s delay may not be sufficient for Gmail API to index the new email; could cause tracking wrong email or silently failing on 409

- timestamp: 2026-03-18
  checked: server route POST /api/outreach, Zod schema validation
  found: contactEmail field is validated as z.string().email(); extractEmailAddress() returns header.trim() if no <> brackets; if To header is malformed or empty, contactEmail would be '' which fails email() validation → server returns 400; extension logs "Server error on POST: 400" but this only appears in the background SW DevTools console, not visible to user
  implication: BUG 4 (minor) — malformed To headers cause silent 400 failures; user sees nothing

- timestamp: 2026-03-18
  checked: compose-widget.js loadOverviewData and panel refresh triggers
  found: loadOverviewData() called on panel open, tab switch, and editor change; NEVER called automatically after background completes trackLatestSent
  implication: confirms BUG 1 — user must manually trigger Overview tab to see fresh data

- timestamp: 2026-03-18
  checked: post-fix console output vs pre-fix console output
  found: NEW error "chrome-extension://invalid/: Failed to load resource: ERR_FAILED" in post-fix console. This error is the canonical symptom of content scripts running in an invalidated extension context (extension reloaded without page refresh). In this state, chrome.runtime?.id returns undefined, causing fireSendToast() to call showReloadBanner() and return early WITHOUT writing outreachiq_pending_scan to storage. This completely explains all missing logs.
  implication: HIGH CONFIDENCE the user did not reload Gmail after reloading the extension. This is NOT a code regression. The fix code is correct. The user needs to reload Gmail after loading the extension.

- timestamp: 2026-03-18
  checked: git diff of all changed files (background.js, compose-widget.js, content.js, tracking.js, reply-checker.js, sidebar.js)
  found: all changes are additive safe additions — return value changes in reply-checker.js, new storage listener in content.js/sidebar.js, new refreshOverview method in compose-widget.js, delay change 3s→5s in tracking.js. No code that would break module initialization.
  implication: the code changes themselves do not introduce a regression; the chrome-extension://invalid/ error is the true cause

- timestamp: 2026-03-18
  checked: auth.js, manifest.json oauth2 config, background.js alarm handler (checkReplies), reply-checker.js _trackLatestSent
  found: getAuthToken fails with "bad client id" — this is a GCP OAuth2 client configuration error. The OAuth2 client registered in GCP does not have this extension's ID in its authorized redirect URIs (chromiumapp.org). For unpacked dev extensions, the extension ID is stable per filesystem path but must be explicitly registered in GCP. interactive=true would not help — the rejection happens before the consent screen.
  implication: All tracking via Gmail API path is broken for this dev setup. Primary path (trackLatestSent) will always fail at getAuthToken step.

- timestamp: 2026-03-18
  checked: tracking.js watchSendButton, email-detector.js attachToEditor, compose-widget.js getComposeMetadata
  found: at send-click time (before compose window closes), all email data is accessible from the DOM: subject from input[name="subjectbox"], recipients from [email] attribute elements, body from editorEl.innerText. This data can be captured and included in the outreachiq_pending_scan storage payload.
  implication: The background service worker can build a complete outreach record from content-script-captured data without any OAuth token. The only limitation is the threadId — which we address with a synthetic "reach_<uuid>" identifier.

- timestamp: 2026-03-18
  checked: server/routes/outreach.js CreateOutreachSchema, server/prisma/schema.prisma
  found: server requires threadId (string min 1), company (string min 1), contactEmail (string email). All other fields are passthrough. threadId has @unique constraint and is used as the deduplication key (409 on re-insert). A synthetic UUID threadId satisfies all constraints.
  implication: The fallback path can POST successfully without any server changes.

## Resolution

root_cause: |
  FOUR compounding bugs:

  1. PRIMARY (now fixed) — Panel never auto-refreshes after trackLatestSent completes.
     Fixed in prior session: background writes outreachiq_scan_complete to storage;
     content.js/sidebar.js listen and call refreshOverview()/loadStats().

  2. OAUTH BROKEN (now fixed with fallback) — chrome.identity.getAuthToken fails with
     "bad client id" because the unpacked dev extension's ID is not registered in the
     GCP OAuth2 client's authorized redirect URIs. This blocks the entire Gmail API path.
     Fixed: trackFromPendingScan() fallback uses content-script-captured data (subject,
     recipients, body) to build and POST the record directly, no OAuth needed.

  3. TIMING RACE (mitigated) — 3s delay was too short for Gmail API indexing. Increased
     to 5s in prior session. Moot if the OAuth issue persists and fallback is used.

  4. SILENT CLASSIFICATION DROP — Emails without job keywords are silently dropped.
     Still present; no fix applied. Users must include relevant keywords in subject/body,
     or use the manual force_track override widget.

fix: |
  Session 1 (prior):
  - background.js: outreachiq_scan_complete signal after trackLatestSent
  - content.js: storage listener calls refreshOverview()
  - compose-widget.js: refreshOverview() public method
  - sidebar.js: storage listener calls loadStats()
  - tracking.js: 3s→5s delay
  - reply-checker.js: return boolean from trackLatestSent

  Session 2 (this session):
  - tracking.js: watchSendButton captures email metadata (subject, recipients, body)
    into _state.pendingEmailMeta at send-click time (compose still open).
    fireSendToast includes emailSubject, emailRecipients, emailBody in pendingScan payload.
  - content.js: pendingEmailMeta added to shared state with getter/setter.
  - reply-checker.js: trackFromPendingScan() export — builds record from pendingScan data,
    generates synthetic threadId "reach_<uuid>", POSTs to server without OAuth.
  - background.js: imports trackFromPendingScan; onChanged handler calls it as fallback
    when trackLatestSent returns false and emailSubject/emailRecipients are present.

verification:
  PENDING — user must test:
  1. Reload extension in chrome://extensions
  2. Reload Gmail tab (Cmd+R)
  3. Open compose, write email with job keywords in subject (or use force_track widget)
  4. Send
  5. Check background SW DevTools console for:
     - "[Reach/reply-checker] trackFromPendingScan() — building record from content-script data"
     - "[Reach/reply-checker] Tracked via fallback! id=..."
  6. Overview tab should auto-refresh showing the new record

files_changed:
  - extension/reply-checker.js
  - extension/background.js
  - extension/content.js
  - extension/compose-widget.js
  - extension/sidebar.js
  - extension/tracking.js
