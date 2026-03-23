# Global Top Navigation & Home Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current flat header with a two-section global nav (Home | Job Tracker) plus a profile dropdown, and add a Home page with insights, email notifications opt-in, profile completion prompt, and a premium upgrade teaser.

**Architecture:** A new `TopNav.jsx` drives section switching. `ProfileMenu.jsx` is a self-contained dropdown. `HomePage.jsx` composes the home section. `App.jsx` is refactored to host `activeSection` state and render the right page — the existing kanban/list/toolbar only render when `activeSection === 'tracker'`. The "Insights" tab is removed from the job tracker sub-nav since that content moves to HomePage. Stat strip stays in the job tracker sub-header.

**Tech Stack:** React 18, Tailwind CSS 3, existing design tokens (`chrome-*`, `accent`, Syne / Plus Jakarta Sans / IBM Plex Mono), no new npm dependencies.

---

### Task 1: Create `TopNav.jsx`

**Files:**
- Create: `web/src/components/TopNav.jsx`

**Step 1: Scaffold the component**

```jsx
// web/src/components/TopNav.jsx
import { useState, useRef, useEffect } from 'react';
import ProfileMenu from './ProfileMenu';

const NAV_SECTIONS = [
  { id: 'home',    label: 'Home' },
  { id: 'tracker', label: 'Job Tracker' },
];

export default function TopNav({ activeSection, onSectionChange }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // Close profile menu on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handleOutside(e) {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setProfileOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [profileOpen]);

  return (
    <header className="bg-chrome-bg border-b border-chrome-border flex-shrink-0">
      <div className="px-4 sm:px-8 h-12 flex items-center justify-between gap-6">

        {/* Left: Wordmark */}
        <span
          className="font-display text-[18px] font-bold text-chrome-text leading-none tracking-tight flex-shrink-0"
          aria-label="Reach"
        >
          Reach
        </span>

        {/* Center: Section tabs */}
        <nav aria-label="Main sections" className="flex items-stretch h-full gap-1">
          {NAV_SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onSectionChange(id)}
              aria-current={activeSection === id ? 'page' : undefined}
              className={`
                flex items-center px-3 text-[13px] font-display font-semibold border-b-2 transition-all duration-150
                ${activeSection === id
                  ? 'border-accent text-chrome-text'
                  : 'border-transparent text-chrome-muted hover:text-chrome-text'}
              `}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right: Profile avatar button */}
        <div className="relative flex-shrink-0" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(v => !v)}
            aria-label="Open account menu"
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-display font-bold text-[13px] hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
          >
            {/* Static initials placeholder — will be dynamic once auth exists */}
            Y
          </button>
          {profileOpen && (
            <ProfileMenu onClose={() => setProfileOpen(false)} />
          )}
        </div>
      </div>
    </header>
  );
}
```

**Step 2: Verify file saved**

Run: `cat web/src/components/TopNav.jsx`
Expected: file content printed without errors.

**Step 3: Commit**

```bash
git add web/src/components/TopNav.jsx
git commit -m "feat: add TopNav component with Home/Job Tracker tabs and profile avatar"
```

---

### Task 2: Create `ProfileMenu.jsx`

**Files:**
- Create: `web/src/components/ProfileMenu.jsx`

**Step 1: Scaffold the component**

```jsx
// web/src/components/ProfileMenu.jsx

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const MENU_ITEMS = [
  { icon: UserIcon,     label: 'Profile',        onClick: () => {} },
  { icon: FlagIcon,     label: 'Report an issue', onClick: () => {} },
  { icon: SettingsIcon, label: 'Settings',        onClick: () => {} },
];

export default function ProfileMenu({ onClose }) {
  return (
    <div
      role="menu"
      aria-label="Account menu"
      className="absolute right-0 top-10 bg-chrome-surface border border-chrome-border rounded-xl shadow-panel z-50 py-1.5 min-w-[180px]"
    >
      {MENU_ITEMS.map(({ icon: Icon, label, onClick }) => (
        <button
          key={label}
          role="menuitem"
          onClick={() => { onClick(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-chrome-text hover:bg-chrome-deep transition-colors text-left"
        >
          <Icon />
          {label}
        </button>
      ))}

      {/* Divider before sign out */}
      <div className="my-1.5 border-t border-chrome-border" role="separator" />

      <button
        role="menuitem"
        onClick={onClose}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors text-left"
      >
        <SignOutIcon />
        Sign out
      </button>
    </div>
  );
}
```

**Step 2: Verify file saved**

Run: `cat web/src/components/ProfileMenu.jsx`
Expected: file content printed without errors.

**Step 3: Commit**

```bash
git add web/src/components/ProfileMenu.jsx
git commit -m "feat: add ProfileMenu dropdown (Profile, Report Issue, Settings, Sign out)"
```

---

### Task 3: Create `HomePage.jsx`

**Files:**
- Create: `web/src/components/HomePage.jsx`

**Context:** This page renders when the user is on the "Home" section. It contains:
1. **Insights** — reuses the existing `InsightsPanel` component (send-time chart)
2. **Notifications opt-in** — a card with a toggle to enable email notifications (placeholder state, no backend)
3. **Complete your profile** — a card prompting the user to fill in their profile (placeholder CTA, no backend)
4. **Upgrade to Pro** — a teaser card, clearly marked "Coming soon" — no functionality yet

**Step 1: Scaffold the component**

```jsx
// web/src/components/HomePage.jsx
import { useState } from 'react';
import InsightsPanel from './InsightsPanel';

// ── Action card shell ──────────────────────────────────────────────────────

function ActionCard({ children, className = '' }) {
  return (
    <div className={`bg-chrome-surface border border-chrome-rim rounded-xl p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}

// ── Email notifications opt-in ─────────────────────────────────────────────

function NotificationsCard() {
  const [enabled, setEnabled] = useState(false);

  return (
    <ActionCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
            Email digests
          </p>
          <p className="text-[12px] text-chrome-muted leading-relaxed">
            Get a weekly summary of your outreach activity and reply rate delivered to your inbox.
          </p>
        </div>
        {/* Toggle */}
        <button
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? 'Disable email digests' : 'Enable email digests'}
          onClick={() => setEnabled(v => !v)}
          className={`
            relative flex-shrink-0 w-10 h-5.5 rounded-full border transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50
            ${enabled ? 'bg-accent border-accent' : 'bg-chrome-deep border-chrome-border'}
          `}
        >
          <span
            className={`
              absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
              ${enabled ? 'translate-x-4.5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>
    </ActionCard>
  );
}

// ── Complete your profile ──────────────────────────────────────────────────

function CompleteProfileCard() {
  return (
    <ActionCard>
      <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
        Complete your profile
      </p>
      <p className="text-[12px] text-chrome-muted leading-relaxed mb-4">
        Add your name and role so Reach can personalize your outreach suggestions.
      </p>
      <button
        type="button"
        className="text-[12px] font-semibold text-accent hover:text-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
      >
        Set up profile →
      </button>
    </ActionCard>
  );
}

// ── Upgrade teaser ─────────────────────────────────────────────────────────

function UpgradeCard() {
  return (
    <ActionCard className="border-accent/20 bg-accent/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-sans font-semibold text-[14px] text-chrome-text">
              Reach Pro
            </p>
            <span className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded-md">
              Coming soon
            </span>
          </div>
          <p className="text-[12px] text-chrome-muted leading-relaxed">
            Unlock AI-drafted follow-ups, advanced analytics, and priority support.
          </p>
        </div>
      </div>
    </ActionCard>
  );
}

// ── Home page ──────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Insights section — full-width at top */}
      <div className="border-b border-chrome-border">
        <InsightsPanel />
      </div>

      {/* Action cards grid */}
      <div className="p-4 sm:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
        <NotificationsCard />
        <CompleteProfileCard />
        <UpgradeCard />
      </div>
    </div>
  );
}
```

**Step 2: Verify file saved**

Run: `cat web/src/components/HomePage.jsx`
Expected: file content printed without errors.

**Step 3: Commit**

```bash
git add web/src/components/HomePage.jsx
git commit -m "feat: add HomePage with insights, email opt-in, profile prompt, and Pro teaser"
```

---

### Task 4: Refactor `App.jsx` to wire global nav

**Files:**
- Modify: `web/src/App.jsx`

**Context — what changes:**
- Add `activeSection` state (`'home' | 'tracker'`), default `'tracker'`
- Import `TopNav` and `HomePage`
- Replace the current `<header>` block entirely with `<TopNav activeSection={activeSection} onSectionChange={setActiveSection} />`
- The existing sub-nav (Active/Archived tabs + stat strip) is kept but rendered **only when `activeSection === 'tracker'`**
- The "Insights" tab is **removed** from the job tracker sub-tabs — it moves to Home page. The `activeTab` state values change from `['Active', 'Archived', 'Insights']` to `['Active', 'Archived']`. Remove all `activeTab === 'Insights'` branches.
- The toolbar (filter bar) renders only when `activeSection === 'tracker'` (existing condition already guards against Insights; just also guard against `activeSection !== 'tracker'`)
- Main content area: when `activeSection === 'home'` render `<HomePage />`; when `activeSection === 'tracker'` render the existing kanban/list/empty/error views
- The mobile hamburger menu (DotsVerticalIcon) tabs should also remove "Insights" and only list `['Active', 'Archived']`

**Step 1: Read the current App.jsx to confirm line ranges**

The file was read earlier — key structure:
- Lines 1–10: imports
- Lines 14–70: toolbar icon components (keep as-is)
- Lines 74–99: `StatusDot`, `StatPill` (keep as-is)
- Lines 103–115: state declarations — add `activeSection` here
- Lines 257–344: `<header>` block — replace entirely with `<TopNav />`
- Lines 346–494: Toolbar block — gate on `activeSection === 'tracker'`
- Lines 497–566: Main content area — add `activeSection` gate
- Lines 568–578: Sidebar (keep as-is)

**Step 2: Apply the changes to `App.jsx`**

**2a. Add import at top of file** (after existing imports, around line 10):

```jsx
import TopNav from './components/TopNav';
import HomePage from './components/HomePage';
```

**2b. Add `activeSection` state** (after `showMobileMenu` state, around line 116):

```jsx
const [activeSection, setActiveSection] = useState('tracker');
```

**2c. Replace the entire `<header>` block** (lines 260–344 in the original) with:

```jsx
{/* ── Global nav ──────────────────────────────────────────── */}
<TopNav activeSection={activeSection} onSectionChange={setActiveSection} />

{/* ── Job tracker sub-nav (Active / Archived + stats) ─────── */}
{activeSection === 'tracker' && (
  <div className="bg-chrome-bg border-b border-chrome-border px-4 sm:px-8 pt-4 sm:pt-5 flex-shrink-0">
    <nav className="flex mt-0 items-end justify-between" aria-label="Tracker navigation">
      {/* Desktop sub-tabs */}
      <div className="hidden sm:flex gap-6" role="tablist">
        {['Active', 'Archived'].map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-[13px] font-display font-semibold border-b-2 transition-all duration-150 ${
              activeTab === tab
                ? 'border-accent text-chrome-text'
                : 'border-transparent text-chrome-muted hover:text-chrome-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Mobile: current tab indicator + hamburger */}
      <div className="sm:hidden flex items-center justify-between w-full pb-3">
        <span className="font-display text-[13px] font-semibold text-chrome-text border-b-2 border-accent pb-3">
          {activeTab}
        </span>
        <div className="relative" ref={mobileMenuRef}>
          <button
            onClick={() => setShowMobileMenu(v => !v)}
            aria-label="Switch view"
            aria-expanded={showMobileMenu}
            aria-haspopup="menu"
            className="p-2 rounded-lg text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors"
          >
            <DotsVerticalIcon />
          </button>
          {showMobileMenu && (
            <div
              role="menu"
              className="absolute right-0 top-9 bg-chrome-surface border border-chrome-border rounded-lg shadow-lg z-50 p-1 min-w-[140px]"
            >
              {['Active', 'Archived'].map(tab => (
                <button
                  key={tab}
                  role="menuitem"
                  onClick={() => { setActiveTab(tab); setShowMobileMenu(false); }}
                  className={`w-full text-left px-3 py-2 text-[13px] rounded-md transition-colors ${
                    activeTab === tab
                      ? 'text-accent font-semibold bg-accent/5'
                      : 'text-chrome-muted hover:text-chrome-text hover:bg-black/5'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Stat strip (desktop only) ── */}
      <div className="hidden sm:flex items-center pb-3" aria-label="Summary statistics">
        <StatPill value={statSent}    label="SENT" />
        <div className="w-px h-8 bg-chrome-border mx-7" />
        <StatPill value={statReplied} label="REPLIED" />
        <div className="w-px h-8 bg-chrome-border mx-7" />
        <StatPill value={replyRate}   label="REPLY RATE" />
      </div>
    </nav>
  </div>
)}
```

**2d. Gate the toolbar** — wrap the entire toolbar `<div>` with `{activeSection === 'tracker' && (` ... `)}`. The existing `activeTab !== 'Insights'` condition inside can be simplified to just always render (since Insights tab is gone), but for safety keep the gate as `activeSection === 'tracker'` only:

Replace:
```jsx
{activeTab !== 'Insights' && (
  <div className="bg-chrome-surface border-b ...">
```
With:
```jsx
{activeSection === 'tracker' && (
  <div className="bg-chrome-surface border-b ...">
```

**2e. Replace the main content area** — the section starting at the `<div className="flex flex-1 overflow-hidden">`. Replace:

```jsx
{/* ── Main content ────────────────────────────────────────────── */}
<div className="flex flex-1 overflow-hidden">
  <div className="flex-1 overflow-hidden">
    {activeTab === 'Insights' ? (
      <InsightsPanel />
    ) : error && records.length === 0 ? (
```

With:

```jsx
{/* ── Main content ────────────────────────────────────────────── */}
<div className="flex flex-1 overflow-hidden">
  <div className="flex-1 overflow-hidden">
    {activeSection === 'home' ? (
      <HomePage />
    ) : error && records.length === 0 ? (
```

(Remove the `activeTab === 'Insights'` branch entirely — the rest of the conditional chain stays the same.)

**2f. Clean up unused import** — `InsightsPanel` is now only used inside `HomePage.jsx`. Remove it from `App.jsx` imports.

**Step 3: Verify the app builds with no errors**

Run from the `web/` directory:
```bash
cd web && npm run build 2>&1 | tail -20
```
Expected: `✓ built in` — zero errors.

If build fails:
- "Cannot find module './components/TopNav'" → check TopNav.jsx exists and export name matches
- "Cannot find module './components/HomePage'" → check HomePage.jsx exists
- "'activeSection' is not defined" → confirm `const [activeSection, setActiveSection] = useState('tracker');` was added to App state block

**Step 4: Commit**

```bash
git add web/src/App.jsx
git commit -m "refactor: wire TopNav + HomePage into App; remove Insights from tracker sub-nav"
```

---

### Task 5: Visual verification

**Step 1: Start the dev server**

```bash
cd web && npm run dev
```
Open `http://localhost:5173` in the browser.

**Step 2: Check TopNav**

- [ ] "Reach" wordmark appears on the left in Syne font (bold, near-black)
- [ ] "Home" and "Job Tracker" tabs are visible; "Job Tracker" is active by default (orange underline)
- [ ] Burnt-orange avatar circle with "Y" initials is visible on the right
- [ ] Clicking "Home" switches the underline and renders the home page
- [ ] Clicking "Job Tracker" switches back to the kanban/list view

**Step 3: Check ProfileMenu**

- [ ] Clicking the avatar circle opens the dropdown below and right-aligned
- [ ] Items visible: Profile, Report an issue, Settings, (divider), Sign out
- [ ] Each item has its icon on the left
- [ ] Clicking outside or pressing Escape closes the menu
- [ ] "Sign out" is visually de-emphasized (muted color) relative to main items

**Step 4: Check Home page**

- [ ] Insights chart renders (or shows "not enough data" state)
- [ ] Three cards render below: Email digests, Complete your profile, Reach Pro
- [ ] Email digests toggle clicks on/off (local state only)
- [ ] "Reach Pro" card shows "Coming soon" badge and no action button
- [ ] Cards are appropriately spaced in a responsive grid

**Step 5: Check Job Tracker (existing behavior)**

- [ ] "Active" and "Archived" sub-tabs are visible (no "Insights" tab)
- [ ] Stat strip (Sent / Replied / Reply Rate) still visible on desktop
- [ ] Search, filter, archive-all, export CSV, view toggle, refresh — all work as before
- [ ] Kanban board and list view render correctly
- [ ] Sidebar opens on card click

**Step 6: Mobile check (resize to < 640px)**

- [ ] TopNav shows wordmark + tabs + avatar (tabs may be tight — acceptable at this stage)
- [ ] Job Tracker sub-nav shows hamburger + current tab + stat strip (stat strip hidden on mobile by `hidden sm:flex`)

**Step 7: Commit final verification note**

```bash
git commit --allow-empty -m "chore: visual verification complete — global nav + home page"
```
