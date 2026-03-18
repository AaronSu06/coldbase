import { useState, useEffect, useCallback, useRef } from 'react';
import CompanyAvatar from './CompanyAvatar';
import HeartIcon from './icons/HeartIcon';
import BellIcon from './icons/BellIcon';
import ChatIcon from './icons/ChatIcon';
import EyeIcon from './icons/EyeIcon';
import { generateConversationFeedback } from '../lib/gemini';
import { getDaysSince, formatShortDate } from '../lib/utils';

const STEPPER_STEPS = ['Sent', 'Replied', 'Interviewing', 'Offer'];

const IS_PAID_USER = false;

const TIPS = {
  Sent:         ["Personalize your follow-up if no reply within 5 days. Mention something specific from their work.", "Keep the subject line identical in your follow-up so it threads correctly."],
  Replied:      ["Keep your reply concise. Confirm next steps clearly.", "Respond within 24 hours to maintain momentum."],
  Interviewing: ["Send a thank-you follow-up within 24 hours of your interview.", "Reference a specific topic from the conversation to show genuine interest."],
  Offer:        ["Don't accept on the spot. Ask for time to review and compare.", "It's appropriate to negotiate — research market rate for the role first."],
  Ghosted:      ["Wait at least 7 days before a second follow-up. One bump max.", "Keep the follow-up to 1-2 sentences — no explanation or apology needed."],
};

function seedHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function generateFakeFeedback(seed) {
  const h = seedHash(seed || 'default');
  const pick = (arr, offset = 0) => arr[(h + offset) % arr.length];

  const openings  = ["Your subject line was", "The opening hook was", "Your initial message was", "The subject line felt", "Your cold email was"];
  const o_adj     = ["specific and compelling", "clear and direct", "strong and well-targeted", "concise and relevant", "personable and confident"];
  const o_follow  = ["which likely helped your open rate.", "making a strong first impression.", "which shows good research.", "and set the right tone.", "standing out from generic outreach."];

  const improve   = ["However, the second paragraph", "The middle section", "Your closing line", "The follow-up ask", "One area to tighten up"];
  const i_issue   = ["came across as slightly generic.", "could be more specific to their work.", "felt a bit formulaic.", "didn't differentiate you enough.", "lacked a concrete next step."];
  const i_detail  = ["Avoid phrases like \"passionate about\" without evidence.", "Reference something specific from their recent work.", "Tie your experience directly to their team's focus.", "Make the ask smaller and easier to say yes to.", "Swap filler sentences for one concrete proof point."];

  const tones     = ["The overall tone is professional and appropriately confident.", "Tone is warm but could be slightly more direct.", "The tone reads well — conversational without being too casual.", "Tone is polished; consider adding a touch more personality.", "Comes across as genuine, which is your strongest asset here."];

  const nexts     = ["Given the current status, a short personalized bump in 5–7 days would be appropriate.", "Consider referencing a specific project or article from their team in your follow-up.", "A brief reply reaffirming your interest and availability would be a natural next move.", "Reach out to a second contact at the same company to broaden your touchpoints.", "Wait a few more days then send a one-line check-in — keep it light."];

  return [
    `1. What you did well: ${pick(openings, 0)} ${pick(o_adj, 1)}, ${pick(o_follow, 2)}`,
    `\n2. What to improve: ${pick(improve, 3)} ${pick(i_issue, 4)} ${pick(i_detail, 5)}`,
    `\n3. Tone: ${pick(tones, 6)}`,
    `\n4. Next move: ${pick(nexts, 7)}`,
  ].join('');
}

function decodeHtmlEntities(value) {
  if (!value || typeof document === 'undefined') return value || '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function stripQuote(text) {
  if (!text) return text;
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
  if (raw.includes('\n\n')) {
    const hasMarkers = raw.includes('[OUT]') || raw.includes('[IN]');
    if (!hasMarkers) {
      // Single email body — paragraph breaks are not message boundaries
      return [{ from: '', text: raw, fromMe: true }];
    }
    const parts = raw.split('\n\n').map((part, idx) => {
      const fromMe = part.startsWith('[OUT] ');
      const fromContact = part.startsWith('[IN] ');
      const clean = part.replace(/^\[(OUT|IN)\] /, '');
      const colonIdx = clean.indexOf(': ');
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

function ChevronIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

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
  const [nextActionDate, setNextActionDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [conversationExpanded, setConversationExpanded] = useState(true);
  const [showFullThread, setShowFullThread] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const latestRef = useRef({ notes: '', record: null });

  // Reset local state when switching to a different record
  useEffect(() => {
    if (record) {
      setNotes(record.notes || '');
      setFeedback('');
      setFeedbackError(null);
      setConversationExpanded(true);
      setShowFullThread(false);
      setShowDatePicker(false);
      setNextActionDate(
        record.nextActionDate
          ? new Date(record.nextActionDate).toISOString().split('T')[0]
          : ''
      );
    }
  }, [record?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep latestRef in sync for the flush-on-close effect below
  useEffect(() => {
    latestRef.current = { notes, record };
  });

  // Auto-save notes 800ms after the user stops typing.
  useEffect(() => {
    if (!record) return;
    if (notes === (record.notes || '')) return;
    const timer = setTimeout(() => {
      const { notes: n, record: r } = latestRef.current;
      if (r && n !== (r.notes || '')) onUpdateRecord(r.threadId, { notes: n });
    }, 800);
    return () => clearTimeout(timer);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save nextActionDate 800ms after change.
  useEffect(() => {
    if (!record) return;
    const stored = record.nextActionDate
      ? new Date(record.nextActionDate).toISOString().split('T')[0]
      : '';
    if (nextActionDate === stored) return;
    const timer = setTimeout(() => {
      const { record: r } = latestRef.current;
      if (!r) return;
      const iso = nextActionDate
        ? new Date(nextActionDate + 'T12:00:00.000Z').toISOString()
        : null;
      onUpdateRecord(r.threadId, { nextActionDate: iso });
    }, 800);
    return () => clearTimeout(timer);
  }, [nextActionDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush unsaved notes when the sidebar closes or switches to a different record.
  useEffect(() => {
    return () => {
      const { notes, record } = latestRef.current;
      if (!record) return;
      if (notes !== (record.notes || '')) onUpdateRecord(record.threadId, { notes });
    };
  }, [record?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFeedback = useCallback(async () => {
    if (!record) return;
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const result = await generateConversationFeedback(record);
      setFeedback(result);
    } catch (err) {
      setFeedbackError(err?.message || 'Failed to generate feedback.');
    } finally {
      setFeedbackLoading(false);
    }
  }, [record]);

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
                  <HeartIcon filled={!!record.favorite} className="w-4 h-4" />
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

              {/* Left — scrollable content */}
              <div className="flex flex-col overflow-hidden">
                {/* SCROLLABLE: subject + conversation + AI feedback */}
                <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                  <h3 className="font-semibold text-sm text-gray-900 leading-snug">{record.subject}</h3>

                  {/* Date + badges */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{formatShortDate(record.sentDate)}</span>
                      <span className="text-gray-300">·</span>
                      <span>{getDaysSince(record.sentDate)}d ago</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      {getDaysSince(record.sentDate) >= 3 && (
                        <span className="flex items-center gap-1 bg-orange-50 text-orange-500 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap">
                          <BellIcon className="w-3 h-3" /> Follow up
                        </span>
                      )}
                      {!(isGhosted && !record.isOpened) && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${record.isOpened ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}>
                          <EyeIcon className="w-3 h-3" />
                          {record.isOpened ? `${Math.min(record.openCount, 3)}${record.openCount > 3 ? '+' : 'x'} opens` : 'Not opened'}
                        </span>
                      )}
                      {(record.messageCount || 1) > 1 && (
                        <span className="flex items-center gap-1 bg-violet-50 text-violet-500 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap">
                          <ChatIcon className="w-3 h-3" /> {Math.min(record.messageCount, 3)}{record.messageCount > 3 ? '+' : ''} msgs
                        </span>
                      )}
                    </div>
                  </div>

                  {gmailUrl && (
                    <a href={gmailUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover font-medium w-fit">
                      Open in Gmail <ExternalLinkIcon />
                    </a>
                  )}

                  {/* Collapsible Conversation History */}
                  <div>
                    <button onClick={() => setConversationExpanded(v => !v)}
                      className="flex items-center justify-between w-full mb-2 group">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em]">Conversation</p>
                      <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                        <ChevronIcon open={conversationExpanded} />
                      </span>
                    </button>

                    {conversationExpanded ? (
                      (() => {
                        const messages = parseThread(record);
                        if (messages.length === 0) {
                          return <p className="text-xs text-gray-400 italic">No messages in this thread yet.</p>;
                        }
                        const visibleMsgs = showFullThread ? messages : messages.slice(-2);
                        return (
                          <div className="flex flex-col gap-2">
                            {!showFullThread && messages.length > 2 && (
                              <button onClick={() => setShowFullThread(true)}
                                className="text-xs text-accent hover:text-accent-hover font-medium self-start">
                                Show full thread ({messages.length} messages)
                              </button>
                            )}
                            <div className={`flex flex-col gap-3 overflow-x-hidden ${showFullThread ? 'overflow-y-auto max-h-72' : ''}`}>
                              {visibleMsgs.map((msg, i) => {
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
                          </div>
                        );
                      })()
                    ) : (
                      (() => {
                        const messages = parseThread(record);
                        const lastDate = record.repliedAt || record.sentDate;
                        return (
                          <p className="text-xs text-gray-400">
                            {messages.length} message{messages.length !== 1 ? 's' : ''} · last on {formatShortDate(lastDate)}
                          </p>
                        );
                      })()
                    )}
                  </div>

                  {/* AI Conversation Feedback */}
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-2">
                      Conversation Feedback
                    </p>

                    {IS_PAID_USER ? (
                      <div>
                        {!feedback && !feedbackLoading && (
                          <button onClick={handleFeedback} disabled={feedbackLoading}
                            className="w-full flex items-center justify-center gap-1.5 bg-[#4f46e5] text-white text-[13px] font-medium px-4 py-2 rounded-md hover:bg-[#4338ca] disabled:opacity-50 transition-colors">
                            <GeminiIcon />
                            ✦ Generate Feedback
                          </button>
                        )}
                        {feedbackLoading && <p className="text-xs text-gray-400 italic">Generating feedback...</p>}
                        {feedbackError && <p className="text-red-500 text-xs mt-1">{feedbackError}</p>}
                        {feedback && (
                          <div className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100">
                            {feedback}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative rounded-lg overflow-hidden">
                        {/* Blurred fake feedback */}
                        <div aria-hidden="true" className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap p-3 bg-gray-50 border border-gray-100 rounded-lg select-none"
                          style={{ filter: 'blur(5px)', userSelect: 'none' }}>
                          {generateFakeFeedback(record.threadId)}
                        </div>
                        {/* Gradient fade at bottom */}
                        <div className="absolute bottom-0 left-0 right-0 h-16 rounded-b-lg pointer-events-none"
                          style={{ background: 'linear-gradient(to bottom, transparent, rgba(249,250,251,0.95))' }} />
                        {/* CTA overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <button className="flex items-center gap-1.5 bg-[#4f46e5] text-white text-[12px] font-semibold px-4 py-2 rounded-full shadow-lg hover:bg-[#4338ca] transition-colors">
                            ✦ View Personalized Feedback
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right — Metadata + Status + Next Action + Notes + Tips */}
              <div className="flex flex-col overflow-y-auto p-5 gap-6">

                {/* ── Status Stepper ── */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-2">Status</p>
                  <div className="relative">
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

                {/* ── Follow-up Reminder (Next Action Date) ── */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-2">
                    Follow-up Reminder
                  </p>
                  {nextActionDate ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowDatePicker(v => !v)}
                        className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-600 text-[12px] font-medium px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors">
                        Follow up by {formatShortDate(nextActionDate + 'T12:00:00.000Z')}
                      </button>
                      <button onClick={() => { setNextActionDate(''); setShowDatePicker(false); }}
                        className="text-gray-400 hover:text-gray-600 transition-colors" title="Clear reminder">
                        <CloseIcon />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Set a reminder</p>
                  )}
                  {(!nextActionDate || showDatePicker) && (
                    <input type="date" value={nextActionDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => { setNextActionDate(e.target.value); setShowDatePicker(false); }}
                      className="mt-2 text-[12px] font-mono px-3 py-1.5 border border-gray-200 rounded-md text-gray-600 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors w-full" />
                  )}
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

                {/* ── Tips ── */}
                <div>
                  <button onClick={() => setTipsExpanded(v => !v)}
                    className="flex items-center justify-between w-full mb-2 group">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.08em]">Tips</p>
                      <span className="text-[11px] text-gray-300">{record.status} stage</span>
                    </div>
                    <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
                      <ChevronIcon open={tipsExpanded} />
                    </span>
                  </button>
                  {tipsExpanded && (
                    <ul className="flex flex-col gap-2">
                      {(TIPS[record.status] || TIPS['Sent']).map((tip, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                          <p className="text-[12px] text-gray-600 leading-relaxed">{tip}</p>
                        </li>
                      ))}
                    </ul>
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
