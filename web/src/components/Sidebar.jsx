import { useState, useEffect, useCallback, useRef } from 'react';
import CompanyAvatar from './CompanyAvatar';
import { getRecommendedAction, draftBump, draftReply, draftInterviewFollowUp } from '../lib/gemini';
import { getDaysSince } from '../lib/utils';

const STEPPER_STEPS = ['Sent', 'Replied', 'Interviewing', 'Offer'];

function decodeHtmlEntities(value) {
  if (!value || typeof document === 'undefined') return value || '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function stripQuote(text) {
  if (!text) return text;
  // Remove any email reply-quote block. Handles the two universal formats:
  //   Gmail / Apple Mail: "On [date] [name] wrote: ..."
  //   Outlook / corporate: "-----Original Message----- ..."
  // Neither the date nor sender are hardcoded — only the structural markers.
  return text
    .replace(/\s+On\s+\S[\s\S]*?\bwrote:[\s\S]*/i, '')
    .replace(/\s*-{3,}[\s\S]*?-{3,}[\s\S]*/i, '')
    .trim();
}

function parseThread(record) {
  const raw = decodeHtmlEntities(record?.snippet || '').replace(/\r\n/g, '\n').trim();
  if (!raw) {
    const fallback = decodeHtmlEntities(record?.body || record?.subject || '').trim();
    return fallback ? [{ from: '', text: fallback, fromMe: true }] : [];
  }
  // Multi-message format: "[OUT] Name: text\n\n[IN] Name: text"
  if (raw.includes('\n\n')) {
    const hasMarkers = raw.includes('[OUT]') || raw.includes('[IN]');
    const parts = raw.split('\n\n').map((part, idx) => {
      const fromMe = part.startsWith('[OUT] ');
      const fromContact = part.startsWith('[IN] ');
      const clean = part.replace(/^\[(OUT|IN)\] /, '');
      const colonIdx = clean.indexOf(': ');
      // Without markers fall back to position: first message = me, rest = contact
      const resolvedFromMe = hasMarkers ? (fromMe || !fromContact) : (idx === 0);
      if (colonIdx > 0 && colonIdx < 60) {
        return {
          from: clean.slice(0, colonIdx).trim(),
          text: stripQuote(clean.slice(colonIdx + 2).trim()),
          fromMe: resolvedFromMe,
        };
      }
      return { from: '', text: stripQuote(clean.trim()), fromMe: resolvedFromMe };
    }).filter(m => m.text);
    if (parts.length > 0) return parts;
  }
  return [{ from: '', text: raw, fromMe: true }];
}

// ── Icons ──────────────────────────────────────────────────────────────────

function HeartIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4">
      <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function GeminiIcon() {
  return (
    <svg viewBox="0 0 28 28" fill="currentColor" className="w-4 h-4">
      <path d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z" />
    </svg>
  );
}

const ACTION_CONFIG = {
  'bump':               { label: 'Draft Bump Email',          hint: 'No reply detected', fn: draftBump,               tip: 'Bumps should be sent only 3–5 business days after your initial email.' },
  'reply':              { label: 'Draft Reply',               hint: 'Reply received',    fn: draftReply,              tip: 'Reply promptly — responding within 24 hours keeps momentum going.' },
  'interview-followup': { label: 'Draft Interview Follow-up', hint: 'Interview stage',   fn: draftInterviewFollowUp,  tip: 'Send a thank-you follow-up within 24 hours of your interview.' },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function Sidebar({
  record,
  onClose,
  onToggleFavorite,
  onToggleArchived,
  onDelete,
  onUpdateRecord,
  onStatusChange,
}) {
  const isOpen = !!record;

  const [notes, setNotes] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const latestRef = useRef({ notes: '', aiSuggestion: '', draft: '', record: null });

  // Reset local state when switching to a different record
  useEffect(() => {
    if (record) {
      setNotes(record.notes || '');
      setAiSuggestion(record.aiSuggestion || '');
      setDraft(record.draft || '');
      setError(null);
    }
  }, [record?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep latestRef in sync for the flush-on-close effect below
  useEffect(() => {
    latestRef.current = { notes, aiSuggestion, draft, record };
  });

  // Auto-save notes 800ms after the user stops typing.
  // Uses latestRef at fire-time to avoid stale closure issues.
  useEffect(() => {
    if (!record) return;
    if (notes === (record.notes || '')) return;
    const timer = setTimeout(() => {
      const { notes: n, record: r } = latestRef.current;
      if (r && n !== (r.notes || '')) onUpdateRecord(r.threadId, { notes: n });
    }, 800);
    return () => clearTimeout(timer);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save draft 800ms after the user stops typing.
  useEffect(() => {
    if (!record) return;
    if (draft === (record.draft || '')) return;
    const timer = setTimeout(() => {
      const { draft: d, record: r } = latestRef.current;
      if (r && d !== (r.draft || '')) onUpdateRecord(r.threadId, { draft: d });
    }, 800);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush unsaved notes/suggestion/draft when the sidebar closes or switches to a different record.
  // onBlur doesn't fire on unmount, so this is the safety net.
  useEffect(() => {
    return () => {
      const { notes, aiSuggestion, draft, record } = latestRef.current;
      if (!record) return;
      if (notes !== (record.notes || '')) onUpdateRecord(record.threadId, { notes });
      if (aiSuggestion !== (record.aiSuggestion || '')) onUpdateRecord(record.threadId, { aiSuggestion });
      if (draft !== (record.draft || '')) onUpdateRecord(record.threadId, { draft });
    };
  }, [record?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDraft = useCallback(async () => {
    if (!record) return;
    setLoading(true);
    setError(null);
    try {
      const action = getRecommendedAction(record);
      const fn = ACTION_CONFIG[action].fn;
      const generated = await fn(record);
      setAiSuggestion(generated);
      setDraft(generated);
      onUpdateRecord(record.threadId, { aiSuggestion: generated, draft: generated });
    } catch (err) {
      setError(err?.message || 'Failed to generate draft. Check your Gemini API key.');
    } finally {
      setLoading(false);
    }
  }, [record, onUpdateRecord]);

  const handleDelete = useCallback(() => {
    if (!record) return;
    if (window.confirm(`Delete ${record.company}? This cannot be undone.`)) {
      onDelete(record.threadId);
      onClose();
    }
  }, [record, onDelete, onClose]);

  const handleNotesBlur = useCallback(() => {
    if (!record) return;
    onUpdateRecord(record.threadId, { notes });
  }, [record, notes, onUpdateRecord]);

  // Stepper helpers
  const currentStepIndex = record ? STEPPER_STEPS.indexOf(record.status) : -1;
  const isGhosted = record?.status === 'Ghosted';
  const gmailUrl =
    record?.gmailThreadUrl ||
    record?.gmailUrl ||
    (record?.threadId ? `https://mail.google.com/mail/u/0/#sent/${record.threadId}` : '');

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/[0.15] z-30 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[560px] max-w-full bg-white z-40 flex flex-col transform transition-transform duration-200 ease-out shadow-panel ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {record && (
          <>
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 flex-shrink-0">
              <CompanyAvatar domain={record.domain} company={record.company} size="large" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[16px] text-[#0a0a0a] leading-tight truncate">{record.company}</p>
                <p className="text-[13px] text-gray-500 truncate">
                  {record.contactName}{record.contactEmail ? ` · ${record.contactEmail}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  onClick={() => onToggleFavorite(record.threadId)}
                  className={`p-2 rounded-lg transition-colors ${
                    record.favorite
                      ? 'text-rose-500 bg-rose-50'
                      : 'text-gray-400 hover:text-rose-400 hover:bg-gray-100'
                  }`}
                  title={record.favorite ? 'Unfavorite' : 'Favorite'}
                >
                  <HeartIcon filled={!!record.favorite} />
                </button>
                <button
                  onClick={() => onToggleArchived(record.threadId)}
                  className={`p-2 rounded-lg transition-colors ${
                    record.archived
                      ? 'text-sky-500 bg-sky-50'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                  title={record.archived ? 'Unarchive' : 'Archive'}
                >
                  <ArchiveIcon />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <TrashIcon />
                </button>
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  title="Close"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            {/* ── Body: two-column grid ────────────────────────── */}
            <div className="grid grid-cols-2 divide-x divide-gray-200 flex-1 overflow-hidden">

              {/* Left — Email Thread */}
              <div className="flex flex-col overflow-y-auto p-5 gap-4">
                {/* Metadata row */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                  <span>{record.sentDate ? new Date(record.sentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                  <span className="text-gray-300">·</span>
                  <span>{getDaysSince(record.sentDate)}d ago</span>
                  <span className="text-gray-300">·</span>
                  <span className="bg-accent-light text-accent px-2 py-0.5 rounded-md font-medium font-mono text-[11px]">
                    {`${record.messageCount || 1} ${(record.messageCount || 1) === 1 ? 'msg' : 'msgs'}`}
                  </span>
                </div>

                {/* Subject */}
                <h3 className="font-semibold text-sm text-gray-900 leading-snug">{record.subject}</h3>

                {/* Gmail link */}
                {gmailUrl && (
                  <a
                    href={gmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover font-medium w-fit"
                  >
                    Open in Gmail
                    <ExternalLinkIcon />
                  </a>
                )}

                {/* Thread preview */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {(() => {
                    const messages = parseThread(record);
                    if (messages.length === 0) {
                      return (
                        <p className="text-xs text-gray-400 italic">No email preview available.</p>
                      );
                    }
                    return (
                      <div className="flex flex-col gap-3">
                        {messages.map((msg, i) => {
                          const isMe = msg.fromMe;
                          return (
                            <div key={i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              {msg.from && (
                                <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 px-1 ${
                                  isMe ? 'text-indigo-400' : 'text-gray-400'
                                }`}>
                                  {msg.from}
                                </p>
                              )}
                              <div className="relative" style={{ maxWidth: '85%' }}>
                                <div className={`px-3 py-2 ${
                                  isMe
                                    ? 'bg-indigo-500 text-white rounded-2xl rounded-br-sm'
                                    : 'bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm'
                                }`}>
                                  <p className="text-xs leading-relaxed">{msg.text}</p>
                                </div>
                                {/* Tail — clip-path triangle at the bottom corner */}
                                <div style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  ...(isMe ? { right: -9 } : { left: -9 }),
                                  width: 10,
                                  height: 12,
                                  background: isMe ? '#6366f1' : '#f3f4f6',
                                  clipPath: isMe
                                    ? 'polygon(0 0, 0 100%, 100% 100%)'
                                    : 'polygon(100% 0, 100% 100%, 0 100%)',
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Right — Status + Notes + AI */}
              <div className="flex flex-col overflow-y-auto p-5 gap-6">

                {/* ── Status Stepper ── */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-2">Status</p>
                  <div className="relative">
                    {/* Vertical track behind all circles */}
                    <div className="absolute left-[10px] top-3 bottom-3 w-px bg-gray-200" />

                    {[...STEPPER_STEPS, 'Ghosted'].map((step, i) => {
                      const isGhostedStep = step === 'Ghosted';
                      const isCompleted = !isGhosted && !isGhostedStep && i < currentStepIndex;
                      const isActive = (!isGhosted && !isGhostedStep && i === currentStepIndex) ||
                                       (isGhosted && isGhostedStep);
                      const dotColor = isActive
                        ? (isGhostedStep ? '#6b7280' : '#4f46e5')
                        : isCompleted ? '#4f46e5' : 'white';
                      const dotBorder = isCompleted || isActive
                        ? (isGhostedStep && isActive ? '#6b7280' : '#4f46e5')
                        : '#d1d5db';

                      return (
                        <button
                          key={step}
                          onClick={() => onStatusChange(record.threadId, step)}
                          className="relative flex items-center gap-3 w-full text-left py-1.5 px-2 rounded-md transition-colors hover:bg-gray-50"
                        >
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 z-10 bg-white"
                            style={{ backgroundColor: dotColor, borderColor: dotBorder }}
                          >
                            {isCompleted && <CheckIcon />}
                            {isActive && !isGhostedStep && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            {isActive && isGhostedStep && <XSmallIcon />}
                          </div>
                          <span
                            className="text-[13px]"
                            style={{
                              color: isActive ? (isGhostedStep ? '#374151' : '#4f46e5') : isCompleted ? '#374151' : '#9ca3af',
                              fontWeight: isActive ? 600 : 400,
                            }}
                          >
                            {step}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ── Notes ── */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-2">Notes</p>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={handleNotesBlur}
                    placeholder="Add notes about this outreach..."
                    className="w-full h-24 text-sm text-gray-700 border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>

                {/* ── AI Draft Follow-up ── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em]">AI Suggestions</p>
                    <span className="text-[11px] text-gray-400">{ACTION_CONFIG[getRecommendedAction(record)].hint}</span>
                  </div>
                  <button
                    onClick={handleDraft}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#4f46e5] text-white text-[13px] font-medium px-4 py-2 rounded-md hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
                  >
                    <GeminiIcon />
                    {loading ? 'Generating...' : ACTION_CONFIG[getRecommendedAction(record)].label}
                  </button>
                  <div className="flex items-start gap-1.5 mt-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-px">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="7" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12" y2="17" strokeWidth="2.5" />
                    </svg>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      {ACTION_CONFIG[getRecommendedAction(record)].tip}
                    </p>
                  </div>
                  {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
                  {draft && (
                    <div className="mt-3">
                      <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={() => onUpdateRecord(record.threadId, { draft })}
                        className="w-full h-32 text-sm text-gray-700 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(draft);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className={`mt-1.5 text-xs font-medium transition-colors duration-150 ${copied ? 'text-green-600' : 'text-accent hover:text-accent-hover'}`}
                      >
                        {copied ? '✓ Copied!' : 'Copy to clipboard'}
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
