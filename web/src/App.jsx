import { useState, useMemo, useEffect } from 'react';
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

// ── Status dot for list view ───────────────────────────────────────────────

function StatusDot({ status }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: STATUS_COLORS[status] || '#9ca3af' }}
      />
      <span className="text-[12px] text-gray-600">{status}</span>
    </div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────

function StatPill({ value, label }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-mono text-[18px] font-semibold text-[#0a0a0a] leading-none">
        {value}
      </span>
      <span className="font-mono text-[10px] font-medium text-[#9ca3af] uppercase tracking-[0.08em] mt-1">
        {label}
      </span>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const { records, refresh, updateStatus, toggleFavorite, toggleArchived, archiveAll, updateRecord, deleteRecord } = useOutreach();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [activeTab, setActiveTab] = useState('Active');
  const [viewMode, setViewMode] = useState('columns');
  const [visibleColumns, setVisibleColumns] = useState(COLUMNS);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
    // Yield so React paints the spinner before we start async work
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      // relay.js (content script on localhost) bridges postMessage → chrome.runtime
      const request = (type) => new Promise(resolve => {
        const requestId = `${type}-${Date.now()}`;
        const timeout = setTimeout(resolve, 12_000); // give up after 12s
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
      // RECHECK_REPLIES resolves only after checkReplies() finishes writing to DB
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

  // Visibility-based extension trigger
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;

      // Fire-and-forget RECHECK_REPLIES via relay.js
      const requestId = `RECHECK_REPLIES-${Date.now()}`;
      window.postMessage(
        { source: 'outreachiq-webapp', type: 'RECHECK_REPLIES', requestId },
        '*'
      );

      // Re-fetch after extension has had time to patch the server
      setTimeout(refresh, 3_500);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refresh]);

  return (
    <div className="h-screen flex flex-col bg-[#f9fafb]">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-8 pt-5 flex-shrink-0">
        <div>
          <h1 className="text-[20px] font-bold text-[#0a0a0a] leading-tight tracking-tight">
            Reach
            <span className="text-gray-300 font-light mx-2">|</span>
            <span className="font-medium text-gray-500">Your Tracker</span>
          </h1>
          <p className="font-mono text-[11px] text-gray-400 tracking-[0.06em] uppercase mt-0.5">
            {activeCount} total contacts
          </p>
        </div>

        {/* Tabs + stat strip */}
        <nav className="flex mt-4 items-end justify-between">
          <div className="flex gap-6">
            {['Active', 'Archived', 'Insights'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 text-[14px] border-b-[3px] transition-all duration-150 ${
                  activeTab === tab
                    ? 'border-[#4f46e5] text-[#0a0a0a] font-bold'
                    : 'border-transparent text-gray-400 font-medium hover:text-gray-600'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* ── Stat strip ── */}
          <div className="flex items-center pb-3">
            <StatPill value={statSent}    label="SENT" />
            <div className="w-px h-8 bg-[#e5e7eb] mx-7" />
            <StatPill value={statReplied} label="REPLIED" />
            <div className="w-px h-8 bg-[#e5e7eb] mx-7" />
            <StatPill value={replyRate}   label="REPLY RATE" />
          </div>
        </nav>
      </header>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      {activeTab !== 'Insights' && <div className="bg-white border-b border-gray-200 px-8 py-2.5 flex items-center justify-between flex-shrink-0 gap-4">
        {/* Left: filters */}
        <div className="flex items-center gap-2">
          <SearchBar query={query} onSearch={setQuery} />
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="Sent from"
            className="font-mono text-[12px] px-3 py-2 border border-gray-200 rounded-md text-gray-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors w-[130px]"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="Sent until"
            className="font-mono text-[12px] px-3 py-2 border border-gray-200 rounded-md text-gray-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors w-[130px]"
          />
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Favorites toggle */}
          <button
            onClick={() => setShowFavoritesOnly(prev => !prev)}
            className={`flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md transition-colors font-medium ${
              showFavoritesOnly
                ? 'text-rose-500 bg-rose-50'
                : 'text-gray-600 hover:text-[#0a0a0a] hover:bg-gray-100'
            }`}
            title="Toggle favorites"
          >
            <HeartIcon filled={showFavoritesOnly} />
            Favorites
          </button>

          {/* Archive all */}
          <button
            type="button"
            onClick={handleArchiveAll}
            className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md text-gray-600 hover:text-[#0a0a0a] hover:bg-gray-100 transition-colors font-medium"
          >
            <ArchiveBoxIcon />
            Archive all
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md text-gray-600 hover:text-[#0a0a0a] hover:bg-gray-100 transition-colors font-medium"
            title="Export current view as CSV"
          >
            <DownloadIcon />
            Export CSV
          </button>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          {/* Columns picker */}
          {viewMode === 'columns' && (
            <div className="relative group">
              <button className="text-[13px] px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium whitespace-nowrap transition-colors">
                Columns ({visibleColumns.length})
              </button>
              <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-1.5 hidden group-hover:block min-w-max">
                {COLUMNS.map(col => (
                  <label key={col} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-gray-50 rounded-md cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col)}
                      onChange={() => toggleColumnVisible(col)}
                      className="rounded accent-accent w-3.5 h-3.5"
                    />
                    <span className="text-[13px] text-gray-700">{col}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* View toggle */}
          <div className="flex border border-gray-200 rounded-md overflow-hidden ml-1">
            <button
              onClick={() => setViewMode('columns')}
              title="Kanban view"
              className={`px-2.5 py-1.5 transition-colors ${
                viewMode === 'columns' ? 'bg-gray-100 text-[#0a0a0a]' : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              <KanbanIcon />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`px-2.5 py-1.5 border-l border-gray-200 transition-colors ${
                viewMode === 'list' ? 'bg-gray-100 text-[#0a0a0a]' : 'text-gray-400 hover:bg-gray-50'
              }`}
            >
              <ListIcon />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-md text-accent hover:text-accent-hover font-medium transition-colors disabled:opacity-60"
          >
            <span className={`inline-flex ${isRefreshing ? 'animate-spin' : ''}`}>
              <RefreshIcon />
            </span>
            {isRefreshing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </div>}

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {activeTab === 'Insights' ? (
            <InsightsPanel />
          ) : showEmptySearch ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState context="search" query={query} />
            </div>
          ) : viewMode === 'list' ? (
            <div className="p-8 overflow-y-auto h-full">
              {filtered.length === 0 ? (
                <EmptyState context="board" />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-200">
                      <th className="pb-2.5 font-semibold text-[11px] text-gray-400 uppercase tracking-[0.06em]">Company</th>
                      <th className="pb-2.5 font-semibold text-[11px] text-gray-400 uppercase tracking-[0.06em]">Contact</th>
                      <th className="pb-2.5 font-semibold text-[11px] text-gray-400 uppercase tracking-[0.06em]">Subject</th>
                      <th className="pb-2.5 font-semibold text-[11px] text-gray-400 uppercase tracking-[0.06em]">Status</th>
                      <th className="pb-2.5 font-semibold text-[11px] text-gray-400 uppercase tracking-[0.06em]">Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr
                        key={r.threadId}
                        onClick={() => setSelectedThreadId(r.threadId)}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 font-semibold text-[13px] text-[#0a0a0a]">{r.company}</td>
                        <td className="py-2.5 text-[13px] text-gray-500">{r.contactName}</td>
                        <td className="py-2.5 text-[13px] text-gray-500 max-w-xs truncate">{r.subject}</td>
                        <td className="py-2.5">
                          <StatusDot status={r.status} />
                        </td>
                        <td className="py-2.5 font-mono text-[12px] text-gray-400">
                          {formatShortDate(r.sentDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
