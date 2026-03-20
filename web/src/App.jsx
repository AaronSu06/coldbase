import { useState, useMemo, useEffect, useRef } from 'react';
import { useOutreach } from './hooks/useOutreach';
import KanbanBoard from './components/KanbanBoard';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import EmptyState from './components/EmptyState';
import InsightsPanel from './components/InsightsPanel';
import HeartIcon from './components/icons/HeartIcon';
import { COLUMNS } from '@shared/constants';
import { STATUS_COLORS, formatShortDate } from './lib/utils';

// ── Toolbar icons ─────────────────────────────────────────────────────────

function ArchiveBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-3.5 h-3.5">
      <path d="M3.5 7.5h17v3h-17z" />
      <path d="M5.5 10.5v7a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-7" />
      <path d="M10 13h4" />
    </svg>
  );
}

function KanbanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <rect x="3" y="3" width="5" height="18" rx="1" />
      <rect x="10" y="3" width="5" height="18" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
      <path d="M23 4v6h-6" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-3.5 h-3.5">
      <path d="M12 3v13M7 11l5 5 5-5" />
      <path d="M3 19h18" />
    </svg>
  );
}

function DotsVerticalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

// ── Status dot for list view ───────────────────────────────────────────────

function StatusDot({ status }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: STATUS_COLORS[status] || '#9ca3af' }}
      />
      <span className="text-[12px] text-chrome-muted">{status}</span>
    </div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────

function StatPill({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-[18px] font-semibold text-chrome-text leading-none">
        {value}
      </span>
      <span className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.12em] mt-1">
        {label}
      </span>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const { records, error, refresh, updateStatus, toggleFavorite, toggleArchived, archiveAll, updateRecord, deleteRecord } = useOutreach();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [activeTab, setActiveTab] = useState('Active');
  const [viewMode, setViewMode] = useState('columns');
  const [visibleColumns, setVisibleColumns] = useState(COLUMNS);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const columnPickerRef = useRef(null);
  const mobileMenuRef = useRef(null);

  const selectedRecord = useMemo(() => {
    if (!selectedThreadId) return null;
    return records.find(r => r.threadId === selectedThreadId) || null;
  }, [records, selectedThreadId]);

  const filtered = useMemo(() => {
    return records
      .filter(r => activeTab === 'Archived' ? r.archived : !r.archived)
      .filter(r => showFavoritesOnly ? r.favorite : true)
      .filter(r => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          r.company?.toLowerCase().includes(q) ||
          r.contactName?.toLowerCase().includes(q) ||
          r.subject?.toLowerCase().includes(q)
        );
      })
      .filter(r => dateFrom ? new Date(r.sentDate) >= new Date(dateFrom) : true)
      .filter(r => dateTo ? new Date(r.sentDate) <= new Date(dateTo) : true);
  }, [records, query, activeTab, showFavoritesOnly, dateFrom, dateTo]);

  const statSent    = useMemo(() => records.filter(r => !r.archived).length, [records]);
  const activeCount = statSent;
  const statReplied = useMemo(
    () => records.filter(r => !r.archived && ['Replied', 'Interviewing', 'Offer'].includes(r.status)).length,
    [records]
  );
  const replyRate   = statSent === 0
    ? '—'
    : Math.round((statReplied / statSent) * 100) + '%';

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const request = (type) => new Promise(resolve => {
        const requestId = `${type}-${Date.now()}`;
        const timeout = setTimeout(resolve, 12_000);
        function handler(e) {
          if (e.data?.source === 'outreachiq-relay' && e.data?.requestId === requestId) {
            window.removeEventListener('message', handler);
            clearTimeout(timeout);
            resolve();
          }
        }
        window.addEventListener('message', handler);
        window.postMessage({ source: 'outreachiq-webapp', type, requestId }, '*');
      });
      await Promise.all([request('RESCAN'), request('RECHECK_REPLIES')]);
    } finally {
      refresh();
      setIsRefreshing(false);
    }
  }

  function handleArchiveAll() {
    archiveAll(filtered.map(r => r.threadId));
  }

  function toggleColumnVisible(col) {
    setVisibleColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  }

  function exportCSV() {
    const headers = ['Company', 'Contact', 'Subject', 'Status', 'Sent Date', 'Messages', 'Favorite'];
    const rows = filtered.map(r => [
      r.company ?? '',
      r.contactName ?? '',
      r.subject ?? '',
      r.status ?? '',
      r.sentDate ? new Date(r.sentDate).toLocaleDateString() : '',
      r.messageCount ?? 1,
      r.favorite ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reach ${new Date().toISOString().slice(0, 10)} Summary.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const showEmptySearch = query.trim() && filtered.length === 0;

  // Close column picker on outside click or Escape
  useEffect(() => {
    if (!showColumnPicker) return;
    function handleOutside(e) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target)) {
        setShowColumnPicker(false);
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setShowColumnPicker(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showColumnPicker]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!showMobileMenu) return;
    function handleOutside(e) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setShowMobileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showMobileMenu]);

  // Visibility-based extension trigger
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const requestId = `RECHECK_REPLIES-${Date.now()}`;
      window.postMessage(
        { source: 'outreachiq-webapp', type: 'RECHECK_REPLIES', requestId },
        '*'
      );
      setTimeout(refresh, 3_500);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refresh]);

  return (
    <div className="h-screen flex flex-col bg-chrome-bg">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-chrome-bg border-b border-chrome-border px-4 sm:px-8 pt-4 sm:pt-5 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-[22px] font-bold text-chrome-text leading-tight tracking-tight">
              Reach
            </h1>
            <p className="font-mono text-[10px] text-chrome-muted tracking-[0.08em] uppercase mt-0.5">
              {activeCount} contacts
            </p>
          </div>

          {/* Mobile-only tab menu — top right */}
          <div className="sm:hidden relative mt-1" ref={mobileMenuRef}>
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
                {['Active', 'Archived', 'Insights'].map(tab => (
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

        {/* Tabs + stat strip */}
        <nav className="flex mt-4 items-end justify-between" aria-label="Main navigation">
          {/* Desktop tabs */}
          <div className="hidden sm:flex gap-6" role="tablist">
            {['Active', 'Archived', 'Insights'].map(tab => (
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

          {/* Mobile: current tab indicator */}
          <div className="sm:hidden pb-3">
            <span className="font-display text-[13px] font-semibold text-chrome-text border-b-2 border-accent pb-3">
              {activeTab}
            </span>
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
      </header>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      {activeTab !== 'Insights' && (
        <div className="bg-chrome-surface border-b border-chrome-border px-4 sm:px-8 py-2.5 flex items-center justify-between flex-shrink-0 gap-2 sm:gap-4">
          {/* Left: filters */}
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <div className="flex-1 sm:flex-none">
              <SearchBar query={query} onSearch={setQuery} />
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              aria-label="Filter from date"
              title="Sent from"
              className="hidden sm:block font-mono text-[12px] px-3 py-2 border border-chrome-border rounded-md text-chrome-muted bg-chrome-bg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors w-[130px] [color-scheme:light]"
            />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              aria-label="Filter to date"
              title="Sent until"
              className="hidden sm:block font-mono text-[12px] px-3 py-2 border border-chrome-border rounded-md text-chrome-muted bg-chrome-bg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors w-[130px] [color-scheme:light]"
            />
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Favorites toggle */}
            <button
              onClick={() => setShowFavoritesOnly(prev => !prev)}
              aria-label={showFavoritesOnly ? 'Show all contacts' : 'Show favorites only'}
              aria-pressed={showFavoritesOnly}
              className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 ${
                showFavoritesOnly
                  ? 'text-rose-500 bg-rose-500/10'
                  : 'text-chrome-muted hover:text-chrome-text hover:bg-black/5'
              }`}
            >
              <HeartIcon filled={showFavoritesOnly} />
              <span className="hidden sm:inline">Favorites</span>
            </button>

            {/* Archive all (desktop only) */}
            <button
              type="button"
              onClick={handleArchiveAll}
              aria-label="Archive all visible contacts"
              className="hidden sm:flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <ArchiveBoxIcon />
              Archive all
            </button>

            {/* Export CSV (desktop only) */}
            <button
              type="button"
              onClick={exportCSV}
              aria-label="Export current view as CSV"
              className="hidden sm:flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <DownloadIcon />
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
                  className="text-[13px] px-3 py-1.5 rounded-md border border-chrome-border text-chrome-muted hover:bg-black/5 font-medium whitespace-nowrap transition-colors"
                >
                  Columns ({visibleColumns.length})
                </button>
                {showColumnPicker && (
                  <div
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label="Visible columns"
                    className="absolute right-0 top-9 bg-chrome-surface border border-chrome-border rounded-lg shadow-lg z-50 p-1.5 min-w-max"
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
              className="flex border border-chrome-border rounded-md overflow-hidden sm:ml-1"
              role="group"
              aria-label="View mode"
            >
              <button
                onClick={() => setViewMode('columns')}
                aria-label="Kanban view"
                aria-pressed={viewMode === 'columns'}
                className={`px-2.5 py-1.5 transition-colors ${
                  viewMode === 'columns' ? 'bg-black/[0.07] text-chrome-text' : 'text-chrome-muted hover:bg-black/5'
                }`}
              >
                <KanbanIcon />
              </button>
              <button
                onClick={() => setViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                className={`px-2.5 py-1.5 border-l border-chrome-border transition-colors ${
                  viewMode === 'list' ? 'bg-black/[0.07] text-chrome-text' : 'text-chrome-muted hover:bg-black/5'
                }`}
              >
                <ListIcon />
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label={isRefreshing ? 'Syncing data…' : 'Refresh data'}
              className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md text-accent hover:text-accent-hover font-medium transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <span className={`inline-flex ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true">
                <RefreshIcon />
              </span>
              <span className="hidden sm:inline">{isRefreshing ? 'Syncing…' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'Insights' ? (
            <InsightsPanel />
          ) : error && records.length === 0 ? (
            <div className="flex items-center justify-center flex-1 h-full text-red-500 text-sm">
              Failed to load data. Please refresh.
            </div>
          ) : showEmptySearch ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState context="search" query={query} />
            </div>
          ) : viewMode === 'list' ? (
            <div className="p-4 sm:p-8 overflow-y-auto h-full">
              {filtered.length === 0 ? (
                <EmptyState context="board" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px]">
                    <thead>
                      <tr className="text-left border-b border-chrome-border">
                        <th scope="col" className="pb-2.5 font-sans font-semibold text-[10px] text-chrome-muted uppercase tracking-[0.08em]">Company</th>
                        <th scope="col" className="pb-2.5 font-sans font-semibold text-[10px] text-chrome-muted uppercase tracking-[0.08em] hidden sm:table-cell">Contact</th>
                        <th scope="col" className="pb-2.5 font-sans font-semibold text-[10px] text-chrome-muted uppercase tracking-[0.08em] hidden md:table-cell">Subject</th>
                        <th scope="col" className="pb-2.5 font-sans font-semibold text-[10px] text-chrome-muted uppercase tracking-[0.08em]">Status</th>
                        <th scope="col" className="pb-2.5 font-sans font-semibold text-[10px] text-chrome-muted uppercase tracking-[0.08em] hidden sm:table-cell">Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
                        <tr
                          key={r.threadId}
                          tabIndex={0}
                          aria-label={`Open ${r.company} — ${r.contactName}`}
                          onClick={() => setSelectedThreadId(r.threadId)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedThreadId(r.threadId);
                            }
                          }}
                          className="border-b border-chrome-border hover:bg-black/5 cursor-pointer transition-colors focus:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent/50"
                        >
                          <td className="py-2.5 font-semibold text-[13px] text-chrome-text">{r.company}</td>
                          <td className="py-2.5 text-[13px] text-chrome-muted hidden sm:table-cell">{r.contactName}</td>
                          <td className="py-2.5 text-[13px] text-chrome-muted max-w-xs truncate hidden md:table-cell">{r.subject}</td>
                          <td className="py-2.5">
                            <StatusDot status={r.status} />
                          </td>
                          <td className="py-2.5 font-mono text-[12px] text-chrome-muted hidden sm:table-cell">
                            {formatShortDate(r.sentDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <KanbanBoard
              records={filtered}
              onStatusChange={updateStatus}
              onCardClick={(record) => setSelectedThreadId(record.threadId)}
              visibleColumns={visibleColumns}
              onToggleFavorite={toggleFavorite}
            />
          )}
        </div>
      </div>

      {/* ── Sidebar — fixed overlay ──────────────────────────────────── */}
      <Sidebar
        record={selectedRecord}
        onClose={() => setSelectedThreadId(null)}
        onToggleFavorite={toggleFavorite}
        onToggleArchived={toggleArchived}
        onDelete={deleteRecord}
        onUpdateRecord={updateRecord}
        onStatusChange={updateStatus}
      />
    </div>
  );
}
