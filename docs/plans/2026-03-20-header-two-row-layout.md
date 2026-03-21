# Header Two-Row Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Split the single over-packed tracker bar back into two semantically distinct, compact rows — Row A for navigation + stats, Row B for filters + actions.

**Architecture:** Single file change to `web/src/App.jsx`. The unified tracker bar (`{/* ── Unified tracker bar */}`) is replaced with two separate `activeSection === 'tracker'` conditional blocks. Row A answers "what am I looking at and how is it doing?" Row B answers "how do I find and manipulate records?" No new components needed.

**Tech Stack:** React 18, Tailwind CSS v3, Lucide React (already installed)

---

## Design Target

```
TopNav  (h-12, bg-chrome-bg):
  Reach  |  🏠 Home   💼 Job Tracker  |  [Y avatar]

Row A   (h-10, bg-chrome-bg, border-b):
  [Active] [Archived]  ·····················  2 sent · 1 replied · 50% reply rate

Row B   (h-9,  bg-chrome-surface, border-b):
  [🔍 Search...]  [📅 Date range]  ·  [♥ Favorites] [Archive all] [Export CSV]  ·  [Columns(5)] [⊞|≡] [↺ Refresh]
```

Key decisions:
- Row A: `bg-chrome-bg` (same as TopNav) — it's navigation-level, belongs to the same visual zone
- Row B: `bg-chrome-surface` (`#ffffff`) — slightly distinguished, signals "these are tools"
- Row A height: `h-10` (40px) — tabs + inline stats, no wasted padding
- Row B height: `h-9` (36px) — compact utility strip
- Total sub-header height: 76px vs 88px before (two-row original) — tighter overall
- Stats: `StatInline` component (already exists) — `13px mono number + 10px label`
- Stats disappear on mobile (too tight); mobile overflow menu stays in Row B

---

### Task 1: Split unified bar into Row A (tabs + stats) and Row B (filters + actions)

**Files:**
- Modify: `web/src/App.jsx:201-401`

**Context:**
The current block (lines 201–401) is one large `{activeSection === 'tracker' && <div ...>}` containing tabs, a divider, search, date picker, favorites, archive all, export CSV, columns picker, view toggle, refresh, mobile overflow menu, and stats — all in `h-11 bg-chrome-bg`.

**Step 1: Locate the block to replace**

Open `web/src/App.jsx`. Find the comment:
```
{/* ── Unified tracker bar (tabs + filters + actions + stats) ── */}
```
This is the block starting at `{activeSection === 'tracker' && (` that ends at line ~401.

**Step 2: Replace with two separate rows**

Replace the entire unified bar block with the following two blocks:

```jsx
      {/* ── Row A: navigation + stats ───────────────────────────── */}
      {activeSection === 'tracker' && (
        <div className="bg-chrome-bg border-b border-chrome-border px-4 sm:px-8 flex items-stretch h-10 flex-shrink-0">

          {/* Active / Archived tabs */}
          <div className="flex items-stretch" role="tablist" aria-label="Tracker navigation">
            {['Active', 'Archived'].map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 text-[13px] font-display font-semibold border-b-2 transition-all duration-150 ${
                  activeTab === tab
                    ? 'border-accent text-chrome-text'
                    : 'border-transparent text-chrome-muted hover:text-chrome-text'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Stats — desktop only */}
          <div className="hidden sm:flex items-center gap-5" aria-label="Summary statistics">
            <StatInline value={statSent}    label="sent" />
            <StatInline value={statReplied} label="replied" />
            <StatInline value={replyRate}   label="reply rate" />
          </div>
        </div>
      )}

      {/* ── Row B: filters + actions ─────────────────────────────── */}
      {activeSection === 'tracker' && (
        <div className="bg-chrome-surface border-b border-chrome-border px-4 sm:px-8 flex items-center gap-2 sm:gap-3 h-9 flex-shrink-0">

          {/* Search + date range */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-1 sm:flex-none min-w-0">
              <SearchBar query={query} onSearch={setQuery} />
            </div>
            <div className="hidden sm:block">
              <DateRangePicker
                dateFrom={dateFrom}
                dateTo={dateTo}
                onRangeChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Favorites toggle */}
            <button
              onClick={() => setShowFavoritesOnly(prev => !prev)}
              aria-label={showFavoritesOnly ? 'Show all contacts' : 'Show favorites only'}
              aria-pressed={showFavoritesOnly}
              className={`flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 ${
                showFavoritesOnly
                  ? 'text-rose-500 bg-rose-500/10'
                  : 'text-chrome-muted hover:text-chrome-text hover:bg-black/5'
              }`}
            >
              <Heart size={14} strokeWidth={2} fill={showFavoritesOnly ? 'currentColor' : 'none'} aria-hidden="true" />
              <span className="hidden sm:inline">Favorites</span>
            </button>

            {/* Archive all (desktop only) */}
            <button
              type="button"
              onClick={handleArchiveAll}
              aria-label="Archive all visible contacts"
              className="hidden sm:flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <Archive size={14} strokeWidth={2} aria-hidden="true" />
              Archive all
            </button>

            {/* Export CSV (desktop only) */}
            <button
              type="button"
              onClick={exportCSV}
              aria-label="Export current view as CSV"
              className="hidden sm:flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              Export CSV
            </button>

            <div className="hidden sm:block w-px h-4 bg-chrome-border mx-1" aria-hidden="true" />

            {/* Columns picker — desktop only */}
            {viewMode === 'columns' && (
              <div className="hidden sm:block relative" ref={columnPickerRef}>
                <button
                  onClick={() => setShowColumnPicker(prev => !prev)}
                  aria-expanded={showColumnPicker}
                  aria-haspopup="listbox"
                  aria-label="Toggle column visibility"
                  className="text-[13px] px-2.5 py-1 rounded-md border border-chrome-border text-chrome-muted hover:bg-black/5 font-medium whitespace-nowrap transition-colors"
                >
                  Columns ({visibleColumns.length})
                </button>
                {showColumnPicker && (
                  <div
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label="Visible columns"
                    className="absolute right-0 top-8 bg-chrome-surface border border-chrome-border rounded-lg shadow-lg z-50 p-1.5 min-w-max"
                  >
                    {COLUMNS.map(col => (
                      <label
                        key={col}
                        className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-black/5 rounded-md cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col)}
                          onChange={() => toggleColumnVisible(col)}
                          aria-label={`Show ${col} column`}
                          className="rounded accent-accent w-3.5 h-3.5"
                        />
                        <span className="text-[13px] text-chrome-muted">{col}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View toggle */}
            <div
              className="flex border border-chrome-border rounded-md overflow-hidden ml-0.5"
              role="group"
              aria-label="View mode"
            >
              <button
                onClick={() => setViewMode('columns')}
                aria-label="Kanban view"
                aria-pressed={viewMode === 'columns'}
                className={`px-2.5 py-1 transition-colors ${
                  viewMode === 'columns' ? 'bg-black/[0.07] text-chrome-text' : 'text-chrome-muted hover:bg-black/5'
                }`}
              >
                <Columns3 size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                className={`px-2.5 py-1 border-l border-chrome-border transition-colors ${
                  viewMode === 'list' ? 'bg-black/[0.07] text-chrome-text' : 'text-chrome-muted hover:bg-black/5'
                }`}
              >
                <List size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label={isRefreshing ? 'Syncing data…' : 'Refresh data'}
              className="flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md text-accent hover:text-accent-hover font-medium transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <RefreshCw size={14} strokeWidth={2} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
              <span className="hidden sm:inline">{isRefreshing ? 'Syncing…' : 'Refresh'}</span>
            </button>

            {/* Mobile: overflow menu */}
            <div className="sm:hidden relative" ref={mobileMenuRef}>
              <button
                onClick={() => setShowMobileMenu(v => !v)}
                aria-label="More options"
                aria-expanded={showMobileMenu}
                aria-haspopup="menu"
                className="p-1.5 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors"
              >
                <MoreVertical size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              {showMobileMenu && (
                <div
                  role="menu"
                  className="absolute right-0 top-8 bg-chrome-surface border border-chrome-border rounded-lg shadow-lg z-50 p-1 min-w-[140px]"
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
        </div>
      )}
```

**Step 3: Verify the build**

```bash
cd /Users/aaron/Documents/GitHub/worktrees/ui-refactor-6nw/web
npx vite build 2>&1 | tail -10
```

Expected output: `✓ built in X.XXs` with no errors.

If build fails with a JSX syntax error, re-read the replaced block carefully and check for mismatched braces or closing tags.

**Step 4: Commit**

```bash
cd /Users/aaron/Documents/GitHub/worktrees/ui-refactor-6nw
git add web/src/App.jsx
git commit -m "refactor(ui): split tracker bar into two semantic rows (nav+stats / filters+actions)"
```

---

## Acceptance Criteria

- [ ] Row A (`h-10`, `bg-chrome-bg`): Active/Archived tabs left, stats right, nothing else
- [ ] Row B (`h-9`, `bg-chrome-surface`): Search, date, Favorites, Archive all, Export CSV, Columns, view toggle, Refresh
- [ ] Stats (2 sent · 1 replied · 50%) are adjacent to the tabs in Row A — not separated by 10 controls
- [ ] Total sub-header height ≤ 80px (Row A + Row B = 40 + 36 = 76px)
- [ ] Build passes with no errors
- [ ] Mobile overflow menu still works (in Row B)
- [ ] Columns picker dropdown opens correctly (top-8 offset for h-9 parent)
