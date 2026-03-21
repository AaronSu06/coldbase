# Home Screen Refactor Design

**Date:** 2026-03-20
**Branch:** emdash/ui-refactor-6nw

## Overview

Refactor the home screen to replace the weak "insufficient data" progress-bar state with a dashboard that feels alive from day one, and redesign the Reach Pro card from a "Coming soon" teaser into a real subscription offering.

---

## 1. Insights Panel

### Stats Row (always visible)

Three metric chips rendered at the top of the insights panel regardless of data volume:

- **Total Sent** — count of all sent outreach threads
- **Reply Rate** — percentage of sent that received a reply
- **Replies Received** — raw reply count

Sourced from existing `fetchOutreach` data. Chips display "0" gracefully with no error state.

### Best-Time Chart

**Sufficient data state** (≥20 sent, ≥5 replies): The existing 24-bar hourly reply-rate chart, unchanged. Bars scaled to reply rate, top 3 highlighted in accent color, hover tooltips, "Top send windows" legend below.

**Insufficient data state**: The same 24-bar chart rendered as a ghost — bars at plausible/representative heights, desaturated and dimmed (e.g. `opacity-30`, `bg-chrome-surface`). A centered overlay displays:

```
Unlock send-time insights
14 / 20 emails sent · 2 / 5 replies
```

No progress bars. The ghost chart communicates what's coming; the overlay communicates the unlock condition. Feels like earning a feature rather than hitting a wall.

---

## 2. Card Layout

### Row 1: 2-column grid

| Left | Right |
|------|-------|
| Email Digests | Complete Profile |

Both cards unchanged functionally from current implementation.

### Row 2: Full-width

**Reach Pro** spans the full width below the 2-column row.

#### Card internals

**Left side:**
- Headline: "Reach Pro"
- Feature list (3 items): AI-drafted follow-ups, Advanced analytics, Priority support
- No "Coming soon" badge

**Right side:** Two pricing columns side by side:

| Monthly | Annual |
|---------|--------|
| $19 / mo | $15 / mo |
| — | billed $180 / yr |
| — | "Save 21%" badge |
| Subscribe button | Subscribe button (visually emphasized) |

Annual option is subtly emphasized as the better deal (e.g. accent border or filled button vs outline).

**Card styling:** Retains current `border-accent/20 bg-accent/[0.03]` treatment — tasteful, not a loud hero. Positioned at the bottom of the page so it's accessible without dominating.

> **Note:** Pricing figures ($19/$15) are placeholders — update before shipping.

---

## Design Rationale

- **Stats row:** Makes the home screen immediately useful to new users. Zero sent still shows a real dashboard, not an empty state.
- **Ghost chart:** Communicates future value without making users feel penalized for being new. Common SaaS "unlock" pattern.
- **Reach Pro at bottom:** Existing users see insights first (value), then the upgrade option. Paying customers can find it without it feeling pushy to everyone else.
- **Two pricing options:** Monthly lowers the barrier to subscribe; annual increases LTV. Annual visually emphasized as the recommended path.

---

## Files to Modify

- `web/src/components/InsightsPanel.jsx` — stats row + ghost chart for insufficient state
- `web/src/components/HomePage.jsx` — card grid layout + UpgradeCard redesign
- `web/src/lib/api.js` — no changes needed (stats derived from existing `fetchOutreach`)
