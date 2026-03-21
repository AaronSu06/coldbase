# Home Screen Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace the weak insufficient-data progress-bar state with a stats row + ghost chart, and redesign the Reach Pro card from a "Coming soon" teaser into a real subscription pricing card.

**Architecture:** Two files touched — `InsightsPanel.jsx` gets a stats row and a ghost chart for the insufficient-data branch; `HomePage.jsx` gets a new card grid layout and a redesigned `UpgradeCard`. No new API endpoints needed — stats are derived from the existing `fetchBestTime` response which already carries `sent` and `replied` totals.

**Tech Stack:** React, Tailwind CSS, existing `fetchBestTime` API

---

### Task 1: Add stats row to InsightsPanel

**Files:**
- Modify: `web/src/components/InsightsPanel.jsx`

This task adds a `StatsRow` sub-component that renders three metric chips — Total Sent, Reply Rate, and Replies Received — above the chart. The data comes from the existing `fetchBestTime` response which already carries `data.sent` and `data.replied` at the top level, in both the sufficient and insufficient states.

**Step 1: Add the StatsRow component above the `export default` in InsightsPanel.jsx**

Insert this function after the `formatHour` helper (before `export default function InsightsPanel`):

```jsx
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
```

**Step 2: Wire StatsRow into both render paths**

In the `data.insufficient` branch, replace the opening `<div className="p-5 sm:p-10 max-w-lg mx-auto">` block so it renders `<StatsRow>` at the top:

```jsx
if (data.insufficient) {
  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <StatsRow sent={data.sent} replied={data.replied} />
      {/* ghost chart goes here in Task 2 */}
    </div>
  );
}
```

In the sufficient-data return, add `<StatsRow sent={data.sent} replied={data.replied} />` immediately after the opening `<div>` and before the `<div className="flex items-baseline justify-between mb-6">` header block. Replace the existing `mb-6` header's subtitle with just the UTC note (the sent/replied counts are now in the stats row):

```jsx
<div className="p-4 sm:p-8 max-w-4xl mx-auto overflow-y-auto h-full">
  <StatsRow sent={data.sent} replied={data.replied} />
  <div className="flex items-baseline justify-between mb-6">
    <div>
      <h2 className="font-display text-[18px] font-bold text-chrome-text mb-0.5">Best Time to Send</h2>
      <p className="text-xs text-chrome-muted">Hours shown in UTC</p>
    </div>
  </div>
  {/* rest of chart unchanged */}
```

**Step 3: Verify visually**

Run the dev server (`npm run dev` from the `web/` directory). Navigate to Home. Confirm three stat chips appear above the chart in both data states.

**Step 4: Commit**

```bash
git add web/src/components/InsightsPanel.jsx
git commit -m "feat(home): add stats row (sent / reply rate / replies) to InsightsPanel"
```

---

### Task 2: Replace progress bars with ghost chart

**Files:**
- Modify: `web/src/components/InsightsPanel.jsx`

Replace the two progress bars in the `data.insufficient` branch with a dimmed ghost version of the 24-bar chart and a centered overlay showing the unlock condition.

**Step 1: Add the ghost heights constant**

Add this constant inside the `data.insufficient` block (after the `if (data.insufficient) {` line, before the return):

```js
// Plausible-looking bell curve peaking around 10am and 2pm UTC
const ghostHeights = Array.from({ length: 24 }, (_, i) => {
  const morning = Math.exp(-Math.pow(i - 10, 2) / 8);
  const afternoon = Math.exp(-Math.pow(i - 14, 2) / 8);
  return Math.max(morning, afternoon) * 75 + 8; // 8–83% range
});
```

**Step 2: Replace the insufficient-data return with ghost chart + overlay**

The full `data.insufficient` block should become:

```jsx
if (data.insufficient) {
  const ghostHeights = Array.from({ length: 24 }, (_, i) => {
    const morning = Math.exp(-Math.pow(i - 10, 2) / 8);
    const afternoon = Math.exp(-Math.pow(i - 14, 2) / 8);
    return Math.max(morning, afternoon) * 75 + 8;
  });

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <StatsRow sent={data.sent} replied={data.replied} />
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-display text-[18px] font-bold text-chrome-text mb-0.5">Best Time to Send</h2>
          <p className="text-xs text-chrome-muted">Hours shown in UTC</p>
        </div>
      </div>

      {/* Ghost chart with overlay */}
      <div className="relative">
        {/* Dimmed ghost bars */}
        <div className="flex items-end gap-1 h-40 mb-2 opacity-25 pointer-events-none select-none">
          {ghostHeights.map((h, i) => (
            <div key={i} className="flex-1">
              <div
                className="w-full rounded-t bg-chrome-surface"
                style={{ height: `${h}%` }}
              />
            </div>
          ))}
        </div>

        {/* X-axis labels (also dimmed) */}
        <div className="flex gap-1 text-[9px] text-chrome-muted font-mono opacity-25 pointer-events-none select-none mb-2">
          {ghostHeights.map((_, i) => (
            <div key={i} className="flex-1 text-center">
              {i % 6 === 0 ? formatHour(i) : ''}
            </div>
          ))}
        </div>

        {/* Centered overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <p className="font-sans font-semibold text-[13px] text-chrome-text">
            Unlock send-time insights
          </p>
          <p className="text-[11px] text-chrome-muted font-mono">
            {data.sent} / 20 emails sent · {data.replied} / 5 replies
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Verify visually**

On the dev server, confirm:
- Stats row shows at top (0 sent, 0%, 0 replies for a fresh account)
- Ghost bars are visible but clearly dimmed
- Overlay text is centered and legible over the ghost chart
- No progress bars anywhere

**Step 4: Commit**

```bash
git add web/src/components/InsightsPanel.jsx
git commit -m "feat(home): replace insufficient-data progress bars with ghost chart + overlay"
```

---

### Task 3: Redesign card layout in HomePage

**Files:**
- Modify: `web/src/components/HomePage.jsx`

Change the 3-column grid to a 2-column grid with Email Digests and Complete Profile side by side, and Reach Pro spanning the full width below.

**Step 1: Update the grid in `HomePage`**

Replace the `<div className="p-4 sm:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">` and its children:

```jsx
{/* Action cards grid */}
<div className="p-4 sm:p-8 max-w-4xl space-y-4">
  {/* Top row: utility cards */}
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <NotificationsCard />
    <CompleteProfileCard />
  </div>
  {/* Bottom row: subscription */}
  <UpgradeCard />
</div>
```

**Step 2: Verify visually**

Confirm Email Digests and Complete Profile are side by side on sm+ screens, and Reach Pro sits below them at full width.

**Step 3: Commit**

```bash
git add web/src/components/HomePage.jsx
git commit -m "refactor(home): 2-col utility cards + full-width Reach Pro below"
```

---

### Task 4: Redesign UpgradeCard as a pricing card

**Files:**
- Modify: `web/src/components/HomePage.jsx`

Replace the `UpgradeCard` function with a proper pricing card showing monthly and annual options.

**Step 1: Replace the UpgradeCard function**

Remove the existing `UpgradeCard` function entirely and replace it with:

```jsx
function UpgradeCard() {
  const features = [
    'AI-drafted follow-up emails',
    'Advanced analytics & reporting',
    'Priority support',
  ];

  return (
    <ActionCard className="border-accent/20 bg-accent/[0.03]">
      <div className="flex flex-col sm:flex-row sm:items-start gap-6">
        {/* Left: headline + features */}
        <div className="flex-1 min-w-0">
          <p className="font-sans font-semibold text-[15px] text-chrome-text mb-2">
            Reach Pro
          </p>
          <ul className="space-y-1">
            {features.map(f => (
              <li key={f} className="flex items-center gap-2 text-[12px] text-chrome-muted">
                <span className="text-accent text-[10px]">✦</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: pricing columns */}
        <div className="flex gap-3 flex-shrink-0">
          {/* Monthly */}
          <div className="flex flex-col items-center gap-2 border border-chrome-border rounded-xl p-4 w-32">
            <p className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted">
              Monthly
            </p>
            <div className="text-center">
              <span className="font-display text-[22px] font-bold text-chrome-text">$19</span>
              <span className="text-[11px] text-chrome-muted"> / mo</span>
            </div>
            <button
              type="button"
              className="w-full text-[11px] font-semibold text-accent border border-accent/40 rounded-lg py-1.5 hover:bg-accent/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              Subscribe
            </button>
          </div>

          {/* Annual (recommended) */}
          <div className="flex flex-col items-center gap-2 border border-accent/40 bg-accent/[0.04] rounded-xl p-4 w-32 relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold font-sans uppercase tracking-[0.08em] bg-accent text-white px-2 py-0.5 rounded-full whitespace-nowrap">
              Save 21%
            </span>
            <p className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted">
              Annual
            </p>
            <div className="text-center">
              <span className="font-display text-[22px] font-bold text-chrome-text">$15</span>
              <span className="text-[11px] text-chrome-muted"> / mo</span>
            </div>
            <p className="text-[9px] text-chrome-muted text-center">billed $180 / yr</p>
            <button
              type="button"
              className="w-full text-[11px] font-semibold text-white bg-accent rounded-lg py-1.5 hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              Subscribe
            </button>
          </div>
        </div>
      </div>
    </ActionCard>
  );
}
```

**Step 2: Remove unused `useState` import from HomePage if NotificationsCard is still using it**

`useState` is still used by `NotificationsCard`, so leave the import as-is.

**Step 3: Verify visually**

Confirm:
- No "Coming soon" badge
- Feature list with ✦ bullets on the left
- Two pricing columns on the right, Annual with filled button + "Save 21%" chip at top
- Card sits full width, accent border, not visually overwhelming

**Step 4: Commit**

```bash
git add web/src/components/HomePage.jsx
git commit -m "feat(home): redesign Reach Pro as pricing card with monthly/annual options"
```

---

## Placeholder Note

The prices ($19/mo monthly, $15/mo annual / $180/yr) are placeholders. Update them in `UpgradeCard` before shipping.
