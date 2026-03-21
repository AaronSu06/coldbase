# Insights Carousel — Design

**Date:** 2026-03-20
**Status:** Approved

---

## Goal

Replace the single Best Time to Send insight with a 3-slide carousel. Each slide is a distinct insight. A global date range picker filters all three. Slides animate left/right on navigation.

---

## Architecture

**Option A chosen:** `InsightsPanel` owns all carousel state, date range, and the unified data fetch. No new files. Slides are inline components within the same file.

---

## Layout & Navigation

The existing `InsightsPanel` container is unchanged (`p-4 sm:p-8 max-w-4xl mx-auto`).

**Top bar** gains two additions (right-aligned):
- From / To date inputs (type="date"), default to all-time (empty = no filter)
- Left `←` and right `→` arrow buttons, dimmed + disabled at boundaries
- A `1 / 3` position counter between the arrows

**StatsRow** (Total Sent / Reply Rate / Replies) remains fixed above the carousel — always visible, always reflects the selected date window.

**Carousel window:** fixed height (`h-64`), `overflow-hidden`. Inner flex row holds all three slides at `width: 300%`. Navigation shifts via `transform: translateX(-${index * 33.333}%)` with `transition-transform duration-300 ease-in-out`.

---

## Data & API

### New endpoint

`GET /api/insights?from=YYYY-MM-DD&to=YYYY-MM-DD`

Omitting `from`/`to` returns all-time data (backwards compatible). The existing `/best-time` route is kept as-is until removed in a later cleanup.

### Response shape

```json
{
  "sent": 42,
  "replied": 18,
  "bestTime": {
    "insufficient": false,
    "data": [{ "hour": 9, "sentCount": 12, "repliedCount": 4, "replyRate": 0.33 }]
  },
  "responseTime": {
    "insufficient": false,
    "avgHours": 31.4,
    "sampleSize": 18
  },
  "replyTrend": {
    "insufficient": false,
    "data": [{ "week": "2026-03-01", "rate": 0.22, "sent": 9 }]
  }
}
```

If a threshold is not met, the relevant key returns `{ "insufficient": true, "sent": N, "replied": N }`.

### Thresholds (hardcoded, commented in route)

| Insight | Threshold |
|---|---|
| Best Time to Send | 20 sent, 5 replied in window |
| Average Response Time | 10 replied with non-null `repliedAt` in window |
| Reply Rate Trend | Window ≥ 30 days AND 10+ sent in window |

### Frontend fetch behaviour

- `InsightsPanel` holds `dateFrom`, `dateTo`, `index` state
- `useEffect` re-fetches on `dateFrom`/`dateTo` change with a 300ms debounce
- Loading and error states are per-fetch, not per-slide

---

## The Three Slides

### Slide 1 — Best Time to Send

Unchanged from current implementation. Data source moves from `fetchBestTime()` to `data.bestTime` from the unified endpoint. Ghost state unchanged (outlined bell-curve bars + overlay).

### Slide 2 — Average Response Time

- Large centred stat: `font-display` bold, e.g. `31h` or `2.4d`
  - Under 24h → display as hours (`Nh`)
  - 24h or over → display as days to 1 decimal (`N.Nd`)
- Label below: `avg. response time`
- Sub-label: `based on N replies`
- Ghost state: dimmed `--h` placeholder + "Need 10 replies to unlock"

### Slide 3 — Reply Rate Trend

- SVG line chart, no external library, drawn from weekly `rate` values
- X-axis: week start dates, Y-axis: 0–100% reply rate
- Top 3 weeks highlighted/labelled
- Ghost state: ghost SVG line + overlay "Need 30 days of data and 10 emails sent"

All slides share the same heading structure:
- `font-display text-[18px] font-bold text-chrome-text` — slide title
- `text-xs text-chrome-muted` — subtitle / context note

---

## Implementation Tasks (for writing-plans)

1. Add `GET /api/insights` unified endpoint with date params and all three insight queries
2. Update `InsightsPanel` — carousel state, date picker UI, arrow navigation, slide window
3. Implement Slide 1 (Best Time) wired to new endpoint
4. Implement Slide 2 (Average Response Time)
5. Implement Slide 3 (Reply Rate Trend — SVG line chart)
6. Wire global date picker to re-fetch with debounce
7. Ghost / locked states for all three slides
