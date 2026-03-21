# Insights Carousel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single Best Time to Send panel with a 3-slide carousel (Best Time, Avg Response Time, Reply Rate Trend) driven by a global date range picker and a new unified `/api/insights` endpoint.

**Architecture:** Option A — `InsightsPanel` owns all state (carousel index, date range, data). A new `GET /api/insights?from=&to=` endpoint replaces the per-insight `/best-time` fetch. Slides animate via `translateX` in an `overflow-hidden` window. The existing `/best-time` route stays untouched.

**Tech Stack:** React, Tailwind CSS, Express, Prisma (PostgreSQL), Node test runner

---

### Task 1: Write failing tests for `GET /api/insights`

**Files:**
- Modify: `server/analytics.test.js`

The existing test file uses Node's built-in test runner with `node:test`. Tests run against a real migrated database — no mocks.

**Step 1: Add the new describe block to `server/analytics.test.js`**

Append after the existing `describe('GET /api/insights/best-time', ...)` block:

```js
describe('GET /api/insights', () => {
  it('returns 200 with all three insight keys when db is empty', async () => {
    const { status, body } = await request('GET', '/api/insights');
    assert.strictEqual(status, 200);
    assert.strictEqual(typeof body.sent, 'number');
    assert.strictEqual(typeof body.replied, 'number');
    assert.ok('bestTime' in body, 'missing bestTime');
    assert.ok('responseTime' in body, 'missing responseTime');
    assert.ok('replyTrend' in body, 'missing replyTrend');
  });

  it('bestTime is insufficient when db is empty', async () => {
    const { body } = await request('GET', '/api/insights');
    assert.strictEqual(body.bestTime.insufficient, true);
  });

  it('responseTime is insufficient when db is empty', async () => {
    const { body } = await request('GET', '/api/insights');
    assert.strictEqual(body.responseTime.insufficient, true);
  });

  it('replyTrend is insufficient when db is empty', async () => {
    const { body } = await request('GET', '/api/insights');
    assert.strictEqual(body.replyTrend.insufficient, true);
  });

  it('accepts from and to query params without error', async () => {
    const { status } = await request('GET', '/api/insights?from=2026-01-01&to=2026-12-31');
    assert.strictEqual(status, 200);
  });

  it('requires x-reach-secret', async () => {
    const { status } = await request('GET', '/api/insights', null, {
      'x-reach-secret': 'wrong',
    });
    assert.strictEqual(status, 401);
  });
});
```

**Step 2: Run the tests — expect failure**

```bash
cd /Users/aaron/Documents/GitHub/reach/server
node --experimental-vm-modules --test analytics.test.js 2>&1 | tail -20
```

Expected: the new `GET /api/insights` tests fail with 404 (route doesn't exist yet). The existing `/best-time` tests should still pass.

**Step 3: Commit the failing tests**

```bash
git add server/analytics.test.js
git commit -m "test(insights): failing tests for unified GET /api/insights endpoint"
```

---

### Task 2: Implement `GET /api/insights` endpoint

**Files:**
- Modify: `server/routes/analytics.js`

**Step 1: Add the Prisma import at the top of analytics.js**

The file already imports `{ prisma }`. Add `Prisma` for the sql helper:

```js
import { Router } from 'express';
import { prisma, Prisma } from '../lib/prisma.js';
```

Check `server/lib/prisma.js` — if it only exports `prisma`, add `Prisma` like this:

```js
// In server/lib/prisma.js, add:
export { Prisma } from '@prisma/client';
```

**Step 2: Add the `/` (root) route handler to `server/routes/analytics.js`**

Add this BEFORE the existing `/best-time` route:

```js
// Thresholds — tune these once you have real user data
const BEST_TIME_MIN_SENT = 20;
const BEST_TIME_MIN_REPLIED = 5;
const RESPONSE_TIME_MIN_REPLIED = 10;
const REPLY_TREND_MIN_SENT = 10;
const REPLY_TREND_MIN_DAYS = 30;

// GET / — unified insights endpoint
// Mounted at /api/insights, so full path is GET /api/insights
// Query params: from=YYYY-MM-DD, to=YYYY-MM-DD (both optional, default = all-time)
router.get('/', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to + 'T23:59:59.999Z') : null;

    // Build reusable date clauses for $queryRaw
    const fromClause = fromDate ? Prisma.sql`AND "sentDate" >= ${fromDate}` : Prisma.sql``;
    const toClause = toDate ? Prisma.sql`AND "sentDate" <= ${toDate}` : Prisma.sql``;

    // ── Totals (always reflect the date window) ───────────────────────────
    const whereDate = {
      archived: false,
      ...(fromDate && { sentDate: { gte: fromDate } }),
      ...(toDate && { sentDate: { lte: toDate } }),
    };
    const totalSent = await prisma.outreach.count({ where: whereDate });
    const totalReplied = await prisma.outreach.count({
      where: { ...whereDate, repliedAt: { not: null } },
    });

    // ── Best Time to Send ─────────────────────────────────────────────────
    let bestTime;
    if (totalSent < BEST_TIME_MIN_SENT || totalReplied < BEST_TIME_MIN_REPLIED) {
      bestTime = { insufficient: true, sent: totalSent, replied: totalReplied };
    } else {
      const rows = await prisma.$queryRaw`
        SELECT
          EXTRACT(HOUR FROM "sentDate")::INTEGER AS hour,
          COUNT(*) AS sent_count,
          SUM(CASE WHEN "repliedAt" IS NOT NULL THEN 1 ELSE 0 END)::INTEGER AS replied_count
        FROM "Outreach"
        WHERE archived = false ${fromClause} ${toClause}
        GROUP BY hour
        ORDER BY hour
      `;
      bestTime = {
        insufficient: false,
        data: rows.map(r => ({
          hour: Number(r.hour),
          sentCount: Number(r.sent_count),
          repliedCount: Number(r.replied_count),
          replyRate: Number(r.sent_count) > 0 ? Number(r.replied_count) / Number(r.sent_count) : 0,
        })),
      };
    }

    // ── Average Response Time ─────────────────────────────────────────────
    let responseTime;
    if (totalReplied < RESPONSE_TIME_MIN_REPLIED) {
      responseTime = { insufficient: true, sent: totalSent, replied: totalReplied };
    } else {
      const [rtRow] = await prisma.$queryRaw`
        SELECT AVG(EXTRACT(EPOCH FROM ("repliedAt" - "sentDate")) / 3600.0) AS avg_hours,
               COUNT(*) AS sample_size
        FROM "Outreach"
        WHERE "repliedAt" IS NOT NULL AND archived = false ${fromClause} ${toClause}
      `;
      responseTime = {
        insufficient: false,
        avgHours: Number(rtRow.avg_hours),
        sampleSize: Number(rtRow.sample_size),
      };
    }

    // ── Reply Rate Trend (weekly) ─────────────────────────────────────────
    let replyTrend;
    // Determine effective date range for the 30-day minimum check
    const effectiveFrom = fromDate ?? (await prisma.outreach.findFirst({
      where: { archived: false },
      orderBy: { sentDate: 'asc' },
      select: { sentDate: true },
    }))?.sentDate;
    const effectiveTo = toDate ?? new Date();
    const daySpan = effectiveFrom
      ? (effectiveTo - effectiveFrom) / (1000 * 60 * 60 * 24)
      : 0;

    if (totalSent < REPLY_TREND_MIN_SENT || daySpan < REPLY_TREND_MIN_DAYS) {
      replyTrend = { insufficient: true, sent: totalSent, replied: totalReplied };
    } else {
      const trendRows = await prisma.$queryRaw`
        SELECT
          DATE_TRUNC('week', "sentDate") AS week,
          COUNT(*) AS sent,
          SUM(CASE WHEN "repliedAt" IS NOT NULL THEN 1 ELSE 0 END)::INTEGER AS replied
        FROM "Outreach"
        WHERE archived = false ${fromClause} ${toClause}
        GROUP BY week
        ORDER BY week
      `;
      replyTrend = {
        insufficient: false,
        data: trendRows.map(r => ({
          week: r.week.toISOString().slice(0, 10),
          sent: Number(r.sent),
          replied: Number(r.replied),
          rate: Number(r.sent) > 0 ? Number(r.replied) / Number(r.sent) : 0,
        })),
      };
    }

    res.json({ sent: totalSent, replied: totalReplied, bestTime, responseTime, replyTrend });
  } catch (e) {
    next(e);
  }
});
```

**Step 3: Export check**

Make sure `server/lib/prisma.js` re-exports `Prisma`. Read it first — if it's just:
```js
import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
```
Then add:
```js
export { Prisma } from '@prisma/client';
```

**Step 4: Run the tests — expect pass**

```bash
cd /Users/aaron/Documents/GitHub/reach/server
node --experimental-vm-modules --test analytics.test.js 2>&1 | tail -20
```

Expected: all tests pass including the new `/api/insights` describe block.

**Step 5: Commit**

```bash
git add server/routes/analytics.js server/lib/prisma.js
git commit -m "feat(api): unified GET /api/insights endpoint with date filtering and 3 insight payloads"
```

---

### Task 3: Add `fetchInsights` to the frontend API client

**Files:**
- Modify: `web/src/lib/api.js`

**Step 1: Add the function**

```js
export const fetchInsights = ({ from, to } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return apiFetch(`${BASE}/insights${qs ? `?${qs}` : ''}`).then(r => r.json());
};
```

**Step 2: Commit**

```bash
git add web/src/lib/api.js
git commit -m "feat(api-client): add fetchInsights with optional date range params"
```

---

### Task 4: Refactor InsightsPanel — carousel shell

**Files:**
- Modify: `web/src/components/InsightsPanel.jsx`

This task wires up the carousel structure: state, date picker, arrow navigation, slide window, and the data fetch. The actual slide content (Tasks 5–7) is stubbed with placeholders here.

**Step 1: Replace the file contents**

The full new `InsightsPanel.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import { fetchInsights } from '../lib/api';

function formatHour(h) {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function StatsRow({ sent, replied }) {
  const rate = sent > 0 ? Math.round((replied / sent) * 100) : 0;
  const stats = [
    { label: 'Total Sent', value: sent },
    { label: 'Reply Rate', value: `${rate}%` },
    { label: 'Replies', value: replied },
  ];
  return (
    <div className="flex gap-4 mb-6">
      {stats.map(s => (
        <div key={s.label} className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted">
            {s.label}
          </span>
          <span className="font-display text-[22px] font-bold text-chrome-text leading-none">
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// Slide placeholders — replaced in Tasks 5, 6, 7
function BestTimeSlide({ data }) {
  return <div className="p-1 text-chrome-muted text-sm">Best Time slide — Task 5</div>;
}

function ResponseTimeSlide({ data }) {
  return <div className="p-1 text-chrome-muted text-sm">Response Time slide — Task 6</div>;
}

function ReplyTrendSlide({ data }) {
  return <div className="p-1 text-chrome-muted text-sm">Reply Trend slide — Task 7</div>;
}

const SLIDES = [
  { key: 'bestTime',      label: 'Best Time to Send',     Component: BestTimeSlide },
  { key: 'responseTime',  label: 'Avg Response Time',     Component: ResponseTimeSlide },
  { key: 'replyTrend',    label: 'Reply Rate Trend',      Component: ReplyTrendSlide },
];

export default function InsightsPanel() {
  const [index, setIndex] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchInsights({ from: dateFrom || undefined, to: dateTo || undefined })
        .then(setData)
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-chrome-muted text-sm min-h-[220px]">
        Loading insights…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm min-h-[220px]">
        Failed to load insights. Please refresh.
      </div>
    );
  }

  if (!data) return null;

  const canPrev = index > 0;
  const canNext = index < SLIDES.length - 1;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Top bar: stats + date picker + navigation */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <StatsRow sent={data.sent} replied={data.replied} />
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-[11px] text-chrome-muted bg-chrome-deep border border-chrome-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            <span className="text-[11px] text-chrome-muted">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-[11px] text-chrome-muted bg-chrome-deep border border-chrome-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>
          {/* Arrow navigation */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={!canPrev}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-chrome-border text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Previous insight"
            >
              ‹
            </button>
            <span className="text-[11px] text-chrome-muted font-mono w-8 text-center">
              {index + 1} / {SLIDES.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex(i => Math.min(SLIDES.length - 1, i + 1))}
              disabled={!canNext}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-chrome-border text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Next insight"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Slide heading */}
      <div className="mb-4">
        <h2 className="font-display text-[18px] font-bold text-chrome-text mb-0.5">
          {SLIDES[index].label}
        </h2>
        <p className="text-xs text-chrome-muted">
          {dateFrom || dateTo
            ? `${dateFrom || 'all time'} – ${dateTo || 'today'}`
            : 'All time · UTC'}
        </p>
      </div>

      {/* Carousel window */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map(({ key, Component }) => (
            <div key={key} className="w-full flex-shrink-0">
              <Component data={data[key]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Verify the carousel renders and arrows work**

Start the dev server if not running:
```bash
cd /Users/aaron/Documents/GitHub/worktrees/ui-refactor-6nw/web && npm run dev
```

Navigate to Home. Confirm:
- Stats row shows
- Arrows navigate between the three placeholder slides
- `1 / 3` counter updates
- Date inputs appear in the top-right
- First/last arrows are dimmed at boundaries

**Step 3: Commit**

```bash
git add web/src/components/InsightsPanel.jsx
git commit -m "feat(home): InsightsPanel carousel shell with date picker, arrows, slide window"
```

---

### Task 5: Implement Slide 1 — Best Time to Send

**Files:**
- Modify: `web/src/components/InsightsPanel.jsx`

Replace the `BestTimeSlide` placeholder with the full implementation. The chart logic is identical to what existed before — only the data source changes from a direct fetch to `data` prop.

**Step 1: Replace `BestTimeSlide`**

```jsx
function GhostChart() {
  const ghostHeights = Array.from({ length: 24 }, (_, i) => {
    const morning = Math.exp(-Math.pow(i - 10, 2) / 8);
    const afternoon = Math.exp(-Math.pow(i - 14, 2) / 8);
    return Math.max(morning, afternoon) * 75 + 8;
  });
  return (
    <div className="relative">
      <div className="flex items-end gap-1 h-40 mb-2 pointer-events-none select-none">
        {ghostHeights.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-chrome-deep border border-chrome-rim"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex gap-1 text-[9px] text-chrome-muted font-mono opacity-40 pointer-events-none select-none mb-2">
        {ghostHeights.map((_, i) => (
          <div key={i} className="flex-1 text-center">
            {i % 6 === 0 ? formatHour(i) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function BestTimeSlide({ data }) {
  if (data.insufficient) {
    return (
      <div className="relative">
        <GhostChart />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <p className="font-sans font-semibold text-[13px] text-chrome-text">
            Unlock send-time insights
          </p>
          <p className="text-[11px] text-chrome-muted font-mono">
            {data.sent} / 20 emails sent · {data.replied} / 5 replies
          </p>
        </div>
      </div>
    );
  }

  const maxRate = Math.max(...data.data.map(d => d.replyRate), 0.001);
  const sorted = [...data.data].sort((a, b) => b.replyRate - a.replyRate);
  const top3Hours = new Set(sorted.slice(0, 3).map(d => d.hour));
  const hourMap = Object.fromEntries(data.data.map(d => [d.hour, d]));
  const hours = Array.from({ length: 24 }, (_, i) => hourMap[i] || { hour: i, sentCount: 0, repliedCount: 0, replyRate: 0 });

  return (
    <>
      <div className="flex items-end gap-1 h-40 mb-2">
        {hours.map(h => {
          const heightPct = maxRate > 0 ? (h.replyRate / maxRate) * 100 : 0;
          const isTop = top3Hours.has(h.hour);
          return (
            <div
              key={h.hour}
              className="flex-1 flex flex-col items-center group relative"
              title={`${formatHour(h.hour)}: ${h.sentCount} sent, ${h.repliedCount} replied (${Math.round(h.replyRate * 100)}%)`}
            >
              <div
                className={`w-full rounded-t transition-all duration-300 ${
                  isTop && h.sentCount > 0 ? 'bg-accent' : 'bg-chrome-surface'
                }`}
                style={{ height: `${Math.max(heightPct, h.sentCount > 0 ? 4 : 0)}%` }}
              />
              {h.sentCount > 0 && (
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-chrome-text text-chrome-bg text-[10px] rounded px-1.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
                  {formatHour(h.hour)}<br />
                  {h.sentCount} sent · {h.repliedCount} replied<br />
                  {Math.round(h.replyRate * 100)}% rate
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 text-[9px] text-chrome-muted font-mono mb-6">
        {hours.map((h, i) => (
          <div key={h.hour} className="flex-1 text-center">
            {i % 6 === 0 ? formatHour(h.hour) : ''}
          </div>
        ))}
      </div>
      {sorted.length > 0 && sorted[0].sentCount > 0 && (
        <div>
          <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em] mb-2">Top send windows</p>
          <div className="flex gap-3 flex-wrap">
            {sorted.slice(0, 3).filter(d => d.sentCount > 0).map((d, i) => (
              <div key={d.hour} className="flex items-center gap-2 bg-accent/10 text-accent rounded-lg px-3 py-2">
                <span className="font-mono text-[11px] text-accent/60">#{i + 1}</span>
                <span className="font-semibold text-sm">{formatHour(d.hour)}</span>
                <span className="text-[11px] text-accent/80">{Math.round(d.replyRate * 100)}% reply rate</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
```

**Step 2: Verify**

Navigate to Home, confirm slide 1 shows the ghost chart (fresh account) or bars (if you have data). Arrow to slide 2 shows the placeholder.

**Step 3: Commit**

```bash
git add web/src/components/InsightsPanel.jsx
git commit -m "feat(home): BestTimeSlide wired to unified insights endpoint"
```

---

### Task 6: Implement Slide 2 — Average Response Time

**Files:**
- Modify: `web/src/components/InsightsPanel.jsx`

**Step 1: Replace `ResponseTimeSlide`**

```jsx
function ResponseTimeSlide({ data }) {
  if (data.insufficient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[180px] gap-2">
        <p className="font-display text-[40px] font-bold text-chrome-border leading-none">--</p>
        <p className="text-[12px] text-chrome-muted">avg. response time</p>
        <p className="text-[11px] text-chrome-muted font-mono mt-2">
          Need {10 - data.replied} more {10 - data.replied === 1 ? 'reply' : 'replies'} to unlock
        </p>
      </div>
    );
  }

  const hours = data.avgHours;
  const display = hours < 24
    ? `${Math.round(hours)}h`
    : `${(hours / 24).toFixed(1)}d`;

  return (
    <div className="flex flex-col items-center justify-center min-h-[180px] gap-2">
      <p className="font-display text-[56px] font-bold text-chrome-text leading-none">
        {display}
      </p>
      <p className="text-[12px] text-chrome-muted uppercase tracking-[0.08em] font-semibold">
        avg. response time
      </p>
      <p className="text-[11px] text-chrome-muted mt-1">
        based on {data.sampleSize} {data.sampleSize === 1 ? 'reply' : 'replies'}
      </p>
    </div>
  );
}
```

**Step 2: Verify**

Navigate to slide 2. On a fresh account, expect the dimmed `--` with "Need 10 more replies to unlock". If you have data, expect a large number like `31h` or `2.4d`.

**Step 3: Commit**

```bash
git add web/src/components/InsightsPanel.jsx
git commit -m "feat(home): ResponseTimeSlide — large centred stat with ghost locked state"
```

---

### Task 7: Implement Slide 3 — Reply Rate Trend (SVG line chart)

**Files:**
- Modify: `web/src/components/InsightsPanel.jsx`

No external library. Pure SVG drawn from the weekly data array.

**Step 1: Replace `ReplyTrendSlide`**

```jsx
function ReplyTrendSlide({ data }) {
  if (data.insufficient) {
    // Ghost SVG line
    const ghostPoints = Array.from({ length: 8 }, (_, i) => ({
      x: (i / 7) * 100,
      y: 50 + Math.sin(i * 0.9) * 20,
    }));
    const ghostPath = ghostPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ');
    return (
      <div className="relative min-h-[180px]">
        <svg viewBox="0 0 100 80" className="w-full h-40 opacity-15" preserveAspectRatio="none">
          <path d={ghostPath} fill="none" stroke="currentColor" strokeWidth="2" className="text-chrome-muted" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <p className="font-sans font-semibold text-[13px] text-chrome-text">
            Unlock reply rate trend
          </p>
          <p className="text-[11px] text-chrome-muted font-mono">
            Need 30 days of data · {data.sent} / 10 emails sent
          </p>
        </div>
      </div>
    );
  }

  const weeks = data.data;
  if (weeks.length === 0) return null;

  const W = 300; // SVG internal width
  const H = 120; // SVG internal height
  const PAD = { top: 8, right: 8, bottom: 24, left: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxRate = Math.max(...weeks.map(w => w.rate), 0.01);
  const xScale = i => PAD.left + (i / Math.max(weeks.length - 1, 1)) * innerW;
  const yScale = r => PAD.top + innerH - (r / maxRate) * innerH;

  const pathD = weeks
    .map((w, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(w.rate).toFixed(1)}`)
    .join(' ');

  // Y-axis ticks at 0, 50%, 100% of maxRate
  const yTicks = [0, 0.5, 1].map(f => ({
    y: yScale(maxRate * f),
    label: `${Math.round(maxRate * f * 100)}%`,
  }));

  // X-axis: show every Nth week label to avoid crowding
  const step = Math.ceil(weeks.length / 5);

  return (
    <div className="min-h-[180px]">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44">
        {/* Y-axis grid lines + labels */}
        {yTicks.map(t => (
          <g key={t.label}>
            <line
              x1={PAD.left} y1={t.y} x2={W - PAD.right} y2={t.y}
              stroke="currentColor" strokeWidth="0.5" className="text-chrome-border"
            />
            <text x={PAD.left - 3} y={t.y + 3} textAnchor="end" fontSize="6" className="fill-chrome-muted font-mono">
              {t.label}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path
          d={`${pathD} L ${xScale(weeks.length - 1).toFixed(1)} ${yScale(0).toFixed(1)} L ${xScale(0).toFixed(1)} ${yScale(0).toFixed(1)} Z`}
          className="fill-accent/10"
        />

        {/* Line */}
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent" strokeLinejoin="round" />

        {/* Data points */}
        {weeks.map((w, i) => (
          <circle key={w.week} cx={xScale(i)} cy={yScale(w.rate)} r="2" className="fill-accent" />
        ))}

        {/* X-axis labels */}
        {weeks.map((w, i) => i % step === 0 && (
          <text key={w.week} x={xScale(i)} y={H - 6} textAnchor="middle" fontSize="6" className="fill-chrome-muted font-mono">
            {w.week.slice(5)} {/* MM-DD */}
          </text>
        ))}
      </svg>
    </div>
  );
}
```

**Step 2: Verify**

Navigate to slide 3. On a fresh account, expect the ghost wavy line with "Unlock reply rate trend" overlay. With data spanning 30+ days, expect a proper line chart.

**Step 3: Commit**

```bash
git add web/src/components/InsightsPanel.jsx
git commit -m "feat(home): ReplyTrendSlide — SVG line chart with ghost locked state"
```

---

## Placeholder Note

Prices in `UpgradeCard` ($19/mo monthly, $15/mo annual / $180/yr) are placeholders. Update before shipping.
