import { useState, useMemo, useEffect, useRef } from 'react';
import { Archive, Download, RefreshCw, Columns3, List, MoreVertical, Heart } from 'lucide-react';
import { useOutreach } from './hooks/useOutreach';
import KanbanBoard from './components/KanbanBoard';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import EmptyState from './components/EmptyState';
import TopNav from './components/TopNav';
import HomePage from './components/HomePage';
import LoginPage from './components/LoginPage';
import SettingsPage from './components/SettingsPage';
import { DateRangePicker } from './components/DateRangePicker';
import { COLUMNS } from '@shared/constants';
import { STATUS_COLORS, formatShortDate } from './lib/utils';
import { fetchInsights } from './lib/api';

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

// ── Compact inline stat ────────────────────────────────────────────────────

function StatInline({ value, label }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-mono text-[13px] font-semibold text-chrome-text leading-none">{value}</span>
      <span className="font-sans text-[10px] font-medium text-chrome-muted uppercase tracking-[0.1em]">{label}</span>
    </span>
  );
}

// ── Mobile filters bottom sheet ───────────────────────────────────────────

function MobileFiltersSheet({ onClose, showFavoritesOnly, onToggleFavorites, onArchiveAll, dateFrom, dateTo, onRangeChange, viewMode, visibleColumns, onToggleColumn }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden="true" />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filter options"
        className="fixed bottom-0 left-0 right-0 z-50 bg-chrome-surface rounded-t-2xl shadow-[0_-4px_24px_rgba(0,0,0,0.10)]"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-chrome-border rounded-full" />
        </div>

        <div className="px-4 pt-1 pb-8 space-y-0.5">
          {/* Favorites toggle */}
          <button
            onClick={() => { onToggleFavorites(); onClose(); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors ${
              showFavoritesOnly
                ? 'bg-rose-500/10 text-rose-500'
                : 'text-chrome-text hover:bg-chrome-deep'
            }`}
          >
            <Heart size={16} strokeWidth={2} fill={showFavoritesOnly ? 'currentColor' : 'none'} />
            <span className="text-[14px] font-medium">
              {showFavoritesOnly ? 'Show all contacts' : 'Show favorites only'}
            </span>
          </button>

          {/* Archive all */}
          <button
            onClick={() => { onArchiveAll(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left text-chrome-text hover:bg-chrome-deep transition-colors"
          >
            <Archive size={16} strokeWidth={2} />
            <span className="text-[14px] font-medium">Archive all visible</span>
          </button>

          <div className="h-px bg-chrome-border !my-2" />

          {/* Date range */}
          <div className="px-2 py-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-chrome-muted mb-2 px-2">Date filter</p>
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onRangeChange={onRangeChange}
            />
          </div>

          {/* Column visibility — kanban only */}
          {viewMode === 'columns' && (
            <>
              <div className="h-px bg-chrome-border !my-2" />
              <div className="px-2 py-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-chrome-muted mb-1 px-2">Visible columns</p>
                {COLUMNS.map(col => (
                  <label key={col} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-chrome-deep cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col)}
                      onChange={() => onToggleColumn(col)}
                      aria-label={`Show ${col} column`}
                      className="accent-accent w-4 h-4"
                    />
                    <span className="text-[14px] text-chrome-text">{col}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const [activeSection, setActiveSection] = useState('tracker');
  const columnPickerRef = useRef(null);

  // Insights state — lifted here so data persists across home/tracker navigation
  const [insightsDateFrom, setInsightsDateFrom] = useState('');
  const [insightsDateTo, setInsightsDateTo] = useState('');
  const [insightsData, setInsightsData] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState(null);
  const insightsDebounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(insightsDebounceRef.current);
    insightsDebounceRef.current = setTimeout(() => {
      setInsightsLoading(true);
      setInsightsError(null);
      fetchInsights({ from: insightsDateFrom || undefined, to: insightsDateTo || undefined })
        .then(setInsightsData)
        .catch(e => setInsightsError(e.message))
        .finally(() => setInsightsLoading(false));
    }, 300);
    return () => clearTimeout(insightsDebounceRef.current);
  }, [insightsDateFrom, insightsDateTo]);

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
  const statReplied = useMemo(
    () => records.filter(r => !r.archived && ['Replied', 'Interviewing', 'Offer'].includes(r.status)).length,
    [records]
  );
  const replyRate   = statSent === 0
    ? '—'
    : Math.round((statReplied / statSent) * 100) + '%';

  const sevenDaysAgo = useMemo(() => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), []);
  const followUpCount = useMemo(
    () => records.filter(r =>
      !r.archived && !r.hasReply && r.status === 'Sent' &&
      new Date(r.sentDate) < sevenDaysAgo
    ).length,
    [records, sevenDaysAgo]
  );

  function refreshInsights() {
    setInsightsLoading(true);
    setInsightsError(null);
    fetchInsights({ from: insightsDateFrom || undefined, to: insightsDateTo || undefined })
      .then(setInsightsData)
      .catch(e => setInsightsError(e.message))
      .finally(() => setInsightsLoading(false));
  }

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
      refreshInsights();
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

  // Visibility-based extension trigger
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      const requestId = `RECHECK_REPLIES-${Date.now()}`;
      window.postMessage(
        { source: 'outreachiq-webapp', type: 'RECHECK_REPLIES', requestId },
        '*'
      );
      setTimeout(() => { refresh(); refreshInsights(); }, 3_500);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refresh]);

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="h-screen flex flex-col bg-chrome-bg">

      {/* ── Top Nav ─────────────────────────────────────────────────── */}
      <TopNav activeSection={activeSection} onSectionChange={setActiveSection} />

      {/* ── Row A: tabs + stats + actions (no bottom border — merges with Row B) ── */}
      {activeSection === 'tracker' && (
        <div className="bg-chrome-bg px-4 sm:px-8 flex items-stretch h-11 flex-shrink-0">

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

          {/* Stats — desktop only */}
          <div className="hidden sm:flex items-center gap-5 ml-6 pl-6 border-l border-chrome-border" aria-label="Summary statistics">
            <StatInline value={statSent}    label="sent" />
            <StatInline value={statReplied} label="replied" />
            <StatInline value={replyRate}   label="reply rate" />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions — desktop only */}
          <div className="hidden sm:flex items-center gap-0.5">
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
              Favorites
            </button>

            <button
              type="button"
              onClick={handleArchiveAll}
              aria-label="Archive all visible contacts"
              className="flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <Archive size={14} strokeWidth={2} aria-hidden="true" />
              Archive all
            </button>

            <button
              type="button"
              onClick={exportCSV}
              aria-label="Export current view as CSV"
              className="flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              Export CSV
            </button>

            <div className="w-px h-4 bg-chrome-border mx-1" aria-hidden="true" />

            {/* Columns picker */}
            {viewMode === 'columns' && (
              <div className="relative" ref={columnPickerRef}>
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
                    className="absolute right-0 top-full mt-1 bg-chrome-surface border border-chrome-border rounded-lg shadow-lg z-50 p-1.5 min-w-max"
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
            <div className="flex border border-chrome-border rounded-md overflow-hidden ml-0.5" role="group" aria-label="View mode">
              <button
                onClick={() => setViewMode('columns')}
                aria-label="Kanban view"
                aria-pressed={viewMode === 'columns'}
                className={`px-2.5 py-1 transition-colors ${viewMode === 'columns' ? 'bg-black/[0.07] text-chrome-text' : 'text-chrome-muted hover:bg-black/5'}`}
              >
                <Columns3 size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
                className={`px-2.5 py-1 border-l border-chrome-border transition-colors ${viewMode === 'list' ? 'bg-black/[0.07] text-chrome-text' : 'text-chrome-muted hover:bg-black/5'}`}
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
              {isRefreshing ? 'Syncing…' : 'Refresh'}
            </button>
          </div>

          {/* Mobile: filters sheet */}
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setShowMobileMenu(v => !v)}
              aria-label="More options"
              aria-expanded={showMobileMenu}
              aria-haspopup="dialog"
              className="p-1.5 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors"
            >
              <MoreVertical size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            {showMobileMenu && (
              <MobileFiltersSheet
                onClose={() => setShowMobileMenu(false)}
                showFavoritesOnly={showFavoritesOnly}
                onToggleFavorites={() => setShowFavoritesOnly(prev => !prev)}
                onArchiveAll={handleArchiveAll}
                dateFrom={dateFrom}
                dateTo={dateTo}
                onRangeChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }}
                viewMode={viewMode}
                visibleColumns={visibleColumns}
                onToggleColumn={toggleColumnVisible}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Row B: full-width search (border-b separates header from content) ── */}
      {activeSection === 'tracker' && (
        <div className="bg-chrome-bg border-b border-chrome-border px-4 sm:px-8 flex items-center gap-3 py-2 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <SearchBar query={query} onSearch={setQuery} />
          </div>
          <div className="hidden sm:block flex-shrink-0">
            <DateRangePicker
              dateFrom={dateFrom}
              dateTo={dateTo}
              onRangeChange={({ from, to }) => { setDateFrom(from); setDateTo(to); }}
            />
          </div>
          {/* Mobile favorites toggle */}
          <button
            onClick={() => setShowFavoritesOnly(prev => !prev)}
            aria-label={showFavoritesOnly ? 'Show all contacts' : 'Show favorites only'}
            aria-pressed={showFavoritesOnly}
            className={`sm:hidden flex items-center p-1.5 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 ${
              showFavoritesOnly ? 'text-rose-500 bg-rose-500/10' : 'text-chrome-muted hover:bg-black/5'
            }`}
          >
            <Heart size={15} strokeWidth={2} fill={showFavoritesOnly ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeSection === 'settings' ? (
            <SettingsPage />
          ) : activeSection === 'home' ? (
            <HomePage
              insightsDateFrom={insightsDateFrom}
              insightsDateTo={insightsDateTo}
              insightsData={insightsData}
              insightsLoading={insightsLoading}
              insightsError={insightsError}
              onInsightsRangeChange={({ from, to }) => { setInsightsDateFrom(from); setInsightsDateTo(to); }}
              followUpCount={followUpCount}
              onGoToTracker={() => setActiveSection('tracker')}
            />
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
