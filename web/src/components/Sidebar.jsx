import { useState, useEffect, useCallback, useRef } from 'react';
import CompanyAvatar from './CompanyAvatar';
import HeartIcon from './icons/HeartIcon';
import BellIcon from './icons/BellIcon';
import ChatIcon from './icons/ChatIcon';
import EyeIcon from './icons/EyeIcon';
import { generateFeedback } from '../lib/api';
import { useUser } from '../hooks/useUser';
import { getDaysSince, formatShortDate, STATUS_COLORS } from '../lib/utils';
import { DayPicker } from 'react-day-picker';
import { parseLocalDate, toDateString } from './DateRangePicker';
import { Pencil } from 'lucide-react';

const STEPPER_STEPS = ['Sent', 'Replied', 'Interviewing', 'Offer'];

// Design token mirrors for inline styles (Tailwind can't interpolate into style={})
const T = {
  ACCENT:        '#b85212',
  CHROME_BG:     '#f8f7f5',
  CHROME_DEEP:   '#f0ede8',
  CHROME_RIM:    '#e4e2dd',
  CHROME_TEXT:   '#1a1917',
  CHROME_SUBTLE: '#9c9189', // inactive step labels — enough contrast on light bg
  GRAY_400:      '#9ca3af', // ghosted state
};

const SHOW_FEEDBACK_UPSELL = true;

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

  const nexts     = ["Given the current status, a short personalized bump in 5–7 days would be appropriate.", "Consider referencing a specific project or article from their team in your follow-up.", "A brief reply reaffirming your interest and availability would be a natural next move.", "Coldbase out to a second contact at the same company to broaden your touchpoints.", "Wait a few more days then send a one-line check-in — keep it light."];

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
  const user = useUser();
  const canUseFeedback = user?.isAdmin || user?.plan === 'pro';

  const [notes, setNotes] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [conversationExpanded, setConversationExpanded] = useState(true);
  const [showFullThread, setShowFullThread] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editValues, setEditValues] = useState({});
  const latestRef = useRef({ notes: '', record: null });
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (record) {
      setNotes(record.notes || '');
      setFeedback('');
      setFeedbackError(null);
      setConversationExpanded(true);
      setShowFullThread(false);
      setShowDatePicker(false);
      setConfirmingDelete(false);
      setIsEditMode(false);
      setEditValues({
        company:      record.company      || '',
        contactName:  record.contactName  || '',
        contactEmail: record.contactEmail || '',
        subject:      record.subject      || '',
      });
      setNextActionDate(
        record.nextActionDate
          ? new Date(record.nextActionDate).toISOString().split('T')[0]
          : ''
      );
    }
  }, [record?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    latestRef.current = { notes, record };
  });

  useEffect(() => {
    if (!record) return;
    if (notes === (record.notes || '')) return;
    const timer = setTimeout(() => {
      const { notes: n, record: r } = latestRef.current;
      if (r && n !== (r.notes || '')) onUpdateRecord(r.threadId, { notes: n });
    }, 800);
    return () => clearTimeout(timer);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    return () => {
      const { notes, record } = latestRef.current;
      if (!record) return;
      if (notes !== (record.notes || '')) onUpdateRecord(record.threadId, { notes });
    };
  }, [record?.threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFeedback = useCallback(async () => {
    if (!record) return;
    if (!canUseFeedback) {
      setFeedbackError('Feedback AI is a Pro feature. Upgrade to use it.');
      return;
    }
    setFeedbackLoading(true);
    setFeedbackError(null);
    try {
      const result = await generateFeedback(record);
      setFeedback(result.text || '');
    } catch (err) {
      setFeedbackError(err?.message || 'Failed to generate feedback.');
    } finally {
      setFeedbackLoading(false);
    }
  }, [record, canUseFeedback]);

  const handleDelete = useCallback(() => {
    if (!record) return;
    onDelete(record.threadId);
    onClose();
  }, [record, onDelete, onClose]);

  const handleNotesBlur = useCallback(() => {
    if (!record) return;
    onUpdateRecord(record.threadId, { notes });
  }, [record, notes, onUpdateRecord]);

  const handleFieldBlur = useCallback((field) => {
    const raw = editValues[field];
    const original = record?.[field] || '';
    if (raw !== original) {
      onUpdateRecord(record.threadId, { [field]: raw });
    }
  }, [record, editValues, onUpdateRecord]);

  const handleFieldKeyDown = useCallback((e, field) => {
    if (e.key === 'Enter') { e.target.blur(); return; }
    if (e.key === 'Escape') {
      setEditValues(v => ({ ...v, [field]: record?.[field] || '' }));
      e.preventDefault();
      e.stopPropagation();
    }
  }, [record]);

  // Capture trigger element before opening, restore on close
  useEffect(() => {
    if (isOpen) {
      returnFocusRef.current = document.activeElement;
    } else {
      returnFocusRef.current?.focus();
    }
  }, [isOpen]);

  // Move focus into panel when it opens
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const first = panelRef.current.querySelector(
      'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, [isOpen]);

  // Focus trap: cycle Tab within panel, close on Escape
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
        className={`fixed inset-0 bg-black/40 z-30 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={record ? `${record.company} — contact details` : 'Contact details'}
        className={`fixed top-0 right-0 h-full w-full sm:w-[560px] bg-chrome-bg z-40 flex flex-col transform transition-transform duration-200 ease-out shadow-panel ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {record && (
          <>
            {/* ── Header ──────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-chrome-border flex-shrink-0">
              <CompanyAvatar domain={record.domain} company={record.company} size="large" />
              <div className="flex-1 min-w-0">
                {isEditMode ? (
                  <input
                    value={editValues.company}
                    onChange={e => setEditValues(v => ({ ...v, company: e.target.value }))}
                    onBlur={() => handleFieldBlur('company')}
                    onKeyDown={e => handleFieldKeyDown(e, 'company')}
                    className="font-semibold text-[16px] text-chrome-text leading-tight w-full bg-transparent border border-chrome-rim rounded px-1 outline-none focus:border-accent"
                  />
                ) : (
                  <p className="font-semibold text-[16px] text-chrome-text leading-tight truncate">
                    {record.company}
                  </p>
                )}
                <div className="flex gap-1 min-w-0">
                  {isEditMode ? (
                    <input
                      value={editValues.contactName}
                      onChange={e => setEditValues(v => ({ ...v, contactName: e.target.value }))}
                      onBlur={() => handleFieldBlur('contactName')}
                      onKeyDown={e => handleFieldKeyDown(e, 'contactName')}
                      placeholder="Name"
                      className="text-[13px] text-chrome-muted w-24 bg-transparent border border-chrome-rim rounded px-1 outline-none focus:border-accent"
                    />
                  ) : (
                    <span className="text-[13px] text-chrome-muted truncate shrink-0">
                      {record.contactName || <span className="opacity-40">Name</span>}
                    </span>
                  )}
                  {(record.contactName || record.contactEmail) && <span className="text-[13px] text-chrome-muted shrink-0">·</span>}
                  {isEditMode ? (
                    <input
                      type="email"
                      value={editValues.contactEmail}
                      onChange={e => setEditValues(v => ({ ...v, contactEmail: e.target.value }))}
                      onBlur={() => handleFieldBlur('contactEmail')}
                      onKeyDown={e => handleFieldKeyDown(e, 'contactEmail')}
                      placeholder="Email"
                      className="text-[13px] text-chrome-muted flex-1 bg-transparent border border-chrome-rim rounded px-1 outline-none focus:border-accent"
                    />
                  ) : (
                    <span className="text-[13px] text-chrome-muted truncate">
                      {record.contactEmail || <span className="opacity-40">Email</span>}
                    </span>
                  )}
                </div>
              </div>
              {confirmingDelete ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[12px] text-red-500 font-medium">Delete forever?</span>
                  <button
                    onClick={handleDelete}
                    autoFocus
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-md text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => setIsEditMode(v => !v)}
                    aria-label={isEditMode ? 'Exit edit mode' : 'Edit record'}
                    aria-pressed={isEditMode}
                    className={`p-2 rounded-lg transition-colors ${
                      isEditMode
                        ? 'text-accent bg-accent/10'
                        : 'text-chrome-muted hover:text-chrome-text hover:bg-black/5'
                    }`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onToggleFavorite(record.threadId)}
                    aria-label={record.favorite ? 'Remove from favorites' : 'Add to favorites'}
                    className={`p-2 rounded-lg transition-colors ${
                      record.favorite
                        ? 'text-rose-500 bg-rose-500/10'
                        : 'text-chrome-muted hover:text-rose-500 hover:bg-black/5'
                    }`}
                  >
                    <HeartIcon filled={!!record.favorite} className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onToggleArchived(record.threadId)}
                    aria-label={record.archived ? 'Unarchive' : 'Archive'}
                    className={`p-2 rounded-lg transition-colors ${
                      record.archived
                        ? 'text-sky-600 bg-sky-500/10'
                        : 'text-chrome-muted hover:text-chrome-text hover:bg-black/5'
                    }`}
                  >
                    <ArchiveIcon />
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    aria-label="Delete this record"
                    className="p-2 rounded-lg text-chrome-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <TrashIcon />
                  </button>
                  <div className="w-px h-5 bg-chrome-border mx-1" aria-hidden="true" />
                  <button
                    onClick={onClose}
                    aria-label="Close panel"
                    className="p-2 rounded-lg text-chrome-muted hover:text-chrome-text hover:bg-black/5 transition-colors"
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
            </div>

            {/* ── Body: two-column grid (single column on mobile) ─── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-chrome-border flex-1 overflow-y-auto sm:overflow-hidden">

              {/* Left — scrollable content */}
              <div className="flex flex-col sm:overflow-hidden">
                <div className="sm:flex-1 sm:overflow-y-auto p-5 flex flex-col gap-4">
                  {editingField === 'subject' ? (
                    <input
                      autoFocus
                      value={editValues.subject}
                      onChange={e => setEditValues(v => ({ ...v, subject: e.target.value }))}
                      onBlur={() => handleFieldBlur('subject')}
                      onKeyDown={e => handleFieldKeyDown(e, 'subject')}
                      className="font-semibold text-sm text-chrome-text w-full bg-transparent border-b border-accent outline-none leading-snug"
                    />
                  ) : (
                    <h3
                      className="font-semibold text-sm text-chrome-text leading-snug cursor-text hover:underline decoration-dashed underline-offset-2"
                      onClick={() => setEditingField('subject')}
                      title="Click to edit"
                    >
                      {record.subject}
                    </h3>
                  )}

                  {/* Date + badges */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-xs text-chrome-muted">
                      {editingField === 'sentDate' ? (
                        <input
                          autoFocus
                          type="date"
                          value={editValues.sentDate}
                          onChange={e => setEditValues(v => ({ ...v, sentDate: e.target.value }))}
                          onBlur={() => handleFieldBlur('sentDate')}
                          onKeyDown={e => handleFieldKeyDown(e, 'sentDate')}
                          className="text-xs text-chrome-text bg-transparent border-b border-accent outline-none"
                        />
                      ) : (
                        <span
                          className="cursor-text hover:underline decoration-dashed underline-offset-2"
                          onClick={() => setEditingField('sentDate')}
                          title="Click to edit"
                        >
                          {formatShortDate(record.sentDate)}
                        </span>
                      )}
                      <span className="text-chrome-rim">·</span>
                      <span>{getDaysSince(record.sentDate)}d ago</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      {getDaysSince(record.sentDate) >= 3 && (
                        <span className="flex items-center gap-1 bg-sky-500/10 text-sky-600 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap">
                          <BellIcon className="w-3 h-3" /> Follow up
                        </span>
                      )}
                      {!(isGhosted && !record.isOpened) && (
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
                          record.isOpened ? 'bg-emerald-500/10 text-emerald-600' : 'bg-black/5 text-chrome-muted'
                        }`}>
                          <EyeIcon className="w-3 h-3" />
                          {record.isOpened ? `${Math.min(record.openCount, 3)}${record.openCount > 3 ? '+' : 'x'} opens` : 'Not opened'}
                        </span>
                      )}
                      {(record.messageCount || 1) > 1 && (
                        <span className="flex items-center gap-1 bg-violet-500/10 text-violet-600 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap">
                          <ChatIcon className="w-3 h-3" /> {Math.min(record.messageCount, 3)}{record.messageCount > 3 ? '+' : ''} msgs
                        </span>
                      )}
                    </div>
                  </div>

                  {gmailUrl && (
                    <a href={gmailUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover font-medium w-fit transition-colors">
                      Open in Gmail <ExternalLinkIcon />
                    </a>
                  )}

                  {/* Collapsible Conversation History */}
                  <div>
                    <button onClick={() => setConversationExpanded(v => !v)}
                      className="flex items-center justify-between w-full mb-2 group">
                      <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em]">Conversation</p>
                      <span className="text-chrome-muted group-hover:text-chrome-text transition-colors">
                        <ChevronIcon open={conversationExpanded} />
                      </span>
                    </button>

                    {conversationExpanded ? (
                      (() => {
                        const messages = parseThread(record);
                        if (messages.length === 0) {
                          return <p className="text-xs text-chrome-muted italic">No messages in this thread yet.</p>;
                        }
                        const visibleMsgs = showFullThread ? messages : messages.slice(-2);
                        return (
                          <div className="flex flex-col gap-2">
                            {!showFullThread && messages.length > 2 && (
                              <button onClick={() => setShowFullThread(true)}
                                className="text-xs text-accent hover:text-accent-hover font-medium self-start transition-colors">
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
                                        isMe ? 'text-accent/70' : 'text-chrome-muted'
                                      }`}>
                                        {msg.from}
                                      </p>
                                    )}
                                    <div className="relative" style={{ maxWidth: '85%' }}>
                                      <div className={`px-3 py-2 ${
                                        isMe
                                          ? 'bg-accent text-white rounded-2xl rounded-br-sm'
                                          : 'bg-chrome-deep text-chrome-subtle border border-chrome-border rounded-2xl rounded-bl-sm'
                                      }`}>
                                        <p className="text-xs leading-relaxed">{msg.text}</p>
                                      </div>
                                      <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        ...(isMe ? { right: -9 } : { left: -9 }),
                                        width: 10,
                                        height: 12,
                                        background: isMe ? T.ACCENT : T.CHROME_DEEP,
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
                          <p className="text-xs text-chrome-muted">
                            {messages.length} message{messages.length !== 1 ? 's' : ''} · last on {formatShortDate(lastDate)}
                          </p>
                        );
                      })()
                    )}
                  </div>

                  {/* AI Conversation Feedback */}
                  <div>
                    <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em] mb-2">
                      Conversation Feedback
                    </p>

                    {SHOW_FEEDBACK_UPSELL ? (
                      <div className="relative rounded-lg overflow-hidden">
                        {/* Blurred fake feedback */}
                        <div aria-hidden="true" className="text-xs text-chrome-subtle leading-relaxed whitespace-pre-wrap p-3 bg-chrome-surface border border-chrome-border rounded-lg select-none"
                          style={{ filter: 'blur(5px)', userSelect: 'none' }}>
                          {generateFakeFeedback(record.threadId)}
                        </div>
                        {/* Gradient fade at bottom */}
                        <div className="absolute bottom-0 left-0 right-0 h-16 rounded-b-lg pointer-events-none"
                          style={{ background: `linear-gradient(to bottom, transparent, ${T.CHROME_BG})` }} />
                        {/* CTA overlay */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <button className="flex items-center gap-1.5 bg-accent text-white text-[12px] font-semibold px-4 py-2 rounded-md shadow-lg hover:bg-accent-hover transition-colors">
                            ✦ View Personalized Feedback
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {!feedback && !feedbackLoading && (
                          canUseFeedback ? (
                            <button onClick={handleFeedback} disabled={feedbackLoading}
                              className="w-full flex items-center justify-center gap-1.5 bg-accent text-white text-[13px] font-medium px-4 py-2 rounded-md hover:bg-accent-hover disabled:opacity-50 transition-colors">
                              <GeminiIcon />
                              ✦ Generate Feedback
                            </button>
                          ) : (
                            <div className="w-full flex items-center justify-center gap-1.5 bg-chrome-deep text-chrome-muted text-[13px] font-medium px-4 py-2 rounded-md border border-chrome-rim cursor-not-allowed select-none">
                              <GeminiIcon />
                              ✦ Generate Feedback — Pro only
                            </div>
                          )
                        )}
                        {feedbackLoading && <p className="text-xs text-chrome-muted italic">Generating feedback...</p>}
                        {feedbackError && <p className="text-red-500 text-xs mt-1">{feedbackError}</p>}
                        {feedback && (
                          <div className="text-xs text-chrome-subtle leading-relaxed whitespace-pre-wrap bg-chrome-surface rounded-lg p-3 border border-chrome-border">
                            {feedback}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right — Metadata + Status + Next Action + Notes + Tips */}
              <div className="flex flex-col sm:overflow-y-auto p-5 gap-6 border-t sm:border-t-0 border-chrome-border">

                {/* ── Status Stepper ── */}
                <div>
                  <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em] mb-3">Status</p>
                  <div className="relative">
                    <div className="absolute left-[10px] top-3 bottom-3 w-px bg-chrome-border" />

                    {[...STEPPER_STEPS, 'Ghosted'].map((step, i) => {
                      const isGhostedStep = step === 'Ghosted';
                      const isCompleted = !isGhosted && !isGhostedStep && i < currentStepIndex;
                      const isActive = (!isGhosted && !isGhostedStep && i === currentStepIndex) ||
                                       (isGhosted && isGhostedStep);

                      // Active: use the status's own color for the dot
                      // Completed: accent
                      // Inactive: transparent with rim border
                      const activeColor = isGhostedStep ? T.GRAY_400 : (STATUS_COLORS[step] || T.ACCENT);
                      const dotBg = isActive ? activeColor : isCompleted ? T.ACCENT : 'transparent';
                      const dotBorder = isActive ? activeColor : isCompleted ? T.ACCENT : T.CHROME_RIM;

                      return (
                        <button
                          key={step}
                          onClick={() => onStatusChange(record.threadId, step)}
                          className="relative flex items-center gap-3 w-full text-left py-1.5 px-2 rounded-md transition-colors hover:bg-black/5"
                        >
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2 z-10 bg-chrome-bg"
                            style={{ backgroundColor: dotBg, borderColor: dotBorder }}
                          >
                            {isCompleted && <CheckIcon />}
                            {isActive && !isGhostedStep && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                            {isActive && isGhostedStep && <XSmallIcon />}
                          </div>
                          <span
                            className="text-[13px]"
                            style={{
                              color: isActive
                                ? (isGhostedStep ? T.GRAY_400 : T.CHROME_TEXT)
                                : isCompleted ? T.CHROME_TEXT : T.CHROME_SUBTLE,
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

                {/* ── Follow-up Reminder ── */}
                <div>
                  <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em] mb-2">
                    Follow-up Reminder
                  </p>
                  {nextActionDate ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setShowDatePicker(v => !v)}
                        className="inline-flex items-center gap-1.5 bg-accent/10 text-accent text-[12px] font-medium px-3 py-1 rounded-lg hover:bg-accent/20 transition-colors">
                        Follow up by {formatShortDate(nextActionDate + 'T12:00:00.000Z')}
                      </button>
                      <button onClick={() => { setNextActionDate(''); setShowDatePicker(false); }}
                        aria-label="Clear reminder"
                        className="text-chrome-muted hover:text-chrome-text transition-colors">
                        <CloseIcon />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-chrome-muted">Set a reminder</p>
                  )}
                  {(!nextActionDate || showDatePicker) && (
                    <div className="mt-2 border border-chrome-border rounded-lg bg-chrome-surface w-fit sm:w-full p-0 sm:p-3">
                      <DayPicker
                        mode="single"
                        navLayout="around"
                        selected={parseLocalDate(nextActionDate)}
                        disabled={{ before: new Date() }}
                        onSelect={(date) => {
                          setNextActionDate(toDateString(date));
                          setShowDatePicker(false);
                        }}
                        styles={{
                          root: {
                            '--rdp-accent-color': '#b85212',
                            '--rdp-accent-background-color': 'rgba(184, 82, 18, 0.1)',
                            '--rdp-day-height': '32px',
                            '--rdp-day-width': '32px',
                            '--rdp-day_button-height': '30px',
                            '--rdp-day_button-width': '30px',
                            '--rdp-day_button-border-radius': '6px',
                            '--rdp-nav-height': '2rem',
                            '--rdp-today-color': '#b85212',
                            '--rdp-selected-border': '2px solid #b85212',
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                          },
                          month_caption: { fontSize: '13px', fontWeight: '500', letterSpacing: '-0.01em', fontFamily: "'Plus Jakarta Sans', sans-serif" },
                          caption_label: { fontSize: '13px', fontWeight: '500', fontFamily: "'Plus Jakarta Sans', sans-serif" },
                          day_button: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '12px' },
                          weekday: { fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Plus Jakarta Sans', sans-serif" },
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* ── Notes ── */}
                <div>
                  <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em] mb-2">Notes</p>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    onBlur={handleNotesBlur}
                    placeholder="Add notes about this outreach..."
                    aria-label="Notes about this outreach"
                    className="w-full h-24 text-sm text-chrome-subtle bg-chrome-surface border border-chrome-border rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 placeholder-stone-300 transition-colors"
                  />
                </div>

                {/* ── Tips ── */}
                <div>
                  <button onClick={() => setTipsExpanded(v => !v)}
                    className="flex items-center justify-between w-full mb-2 group">
                    <div className="flex items-center gap-2">
                      <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em]">Tips</p>
                      <span className="text-[11px] text-chrome-subtle">{record.status} stage</span>
                    </div>
                    <span className="text-chrome-muted group-hover:text-chrome-text transition-colors">
                      <ChevronIcon open={tipsExpanded} />
                    </span>
                  </button>
                  {tipsExpanded && (
                    <ul className="flex flex-col gap-2">
                      {(TIPS[record.status] || TIPS['Sent']).map((tip, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent/40 flex-shrink-0" />
                          <p className="text-[12px] text-chrome-subtle leading-relaxed">{tip}</p>
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
