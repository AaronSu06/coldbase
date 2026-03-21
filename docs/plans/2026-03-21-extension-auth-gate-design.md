# Extension Auth Gate — Design

**Date:** 2026-03-21
**Status:** Approved

## Problem

The auth commit (`053531a`) added `app.use('/api', requireAuth)` which gates all `/api/*`
routes behind JWT verification. The extension's email finder, domain suggest, and AI drafting
endpoints are now inaccessible without a valid JWT. Users who haven't logged in via the web
dashboard see no results with no explanation.

**Product requirement:** Users must create an account before using the extension. No content
is accessible without a valid Reach JWT.

---

## Design

### Auth Gate UI

Both the **compose panel** (`compose-widget.js`) and the **popup** (`panel.js`) check for a
stored JWT on open. If no valid token is found, they render an auth gate instead of their
normal content.

**Auth gate layout:**
- Panel header renders normally (Reach logo, tier badge, close/gear buttons)
- Tab bar is visible but tabs are dimmed and non-interactive (pointer-events: none, opacity: 0.4)
- Tab content area shows:
  - A ghost background: blurred mock of the overview stats (~15% opacity, matching the
    InsightsPanel ghost pattern from the web dashboard)
  - Centered auth card overlaid on top:
    - Reach logo + "Sign in to unlock Reach" heading
    - Subtext: "Track outreach, find contacts, and draft emails."
    - Two CTA buttons: **Log in** and **Create account**
    - Both buttons call `chrome.tabs.create({ url: DASH_URL })` to open the web dashboard

### Sync Mechanism — `chrome.storage.onChanged`

When the auth gate is visible, attach a `chrome.storage.onChanged` listener scoped to
`reach_jwt` in `chrome.storage.local`. As soon as `dashboard-sync.js` writes the token
(after the user logs in on the web dashboard), the listener fires and immediately re-renders
the panel with full content — no polling, no background message required.

This API is part of the WebExtensions standard and works across Chrome, Firefox, Edge,
Opera, Brave, and Safari 14+.

**Listener teardown:** The listener is removed once the token is found, or when the panel
closes, to avoid leaks.

---

## Components Changed

| File | Change |
|------|--------|
| `extension/compose-widget.js` | Auth check in `openComposePanel`; auth gate HTML + styles; `onChanged` listener |
| `extension/panel.js` | Auth check in `buildPanel`; same auth gate HTML + styles; `onChanged` listener |

No server changes required. No background.js changes required.

---

## Success Criteria

- [ ] Opening the compose panel without a JWT shows the auth gate, not panel content
- [ ] Opening the popup without a JWT shows the auth gate, not popup content
- [ ] Clicking "Log in" or "Create account" opens the web dashboard in a new tab
- [ ] After logging in on the dashboard, the extension panel unlocks automatically within 1–2 seconds (no manual reload)
- [ ] After logging in, full panel content renders correctly
- [ ] The auth gate UI matches the ghost/locked aesthetic used on the web dashboard
