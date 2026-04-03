import { useState, useRef, useEffect, useCallback } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-3.5 h-3.5 flex-shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function parseLocalDate(str) {
  if (!str) return undefined;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateString(date) {
  if (!date) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatRangeLabel(from, to) {
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `From ${fmt(from)}`;
  if (to) return `Until ${fmt(to)}`;
  return null;
}

// CSS variable overrides — inline on root element, beats the stylesheet defaults
const RDP_VARS = {
  '--rdp-accent-color': '#b85212',
  '--rdp-accent-background-color': 'rgba(184, 82, 18, 0.12)',
  '--rdp-day-height': '34px',
  '--rdp-day-width': '34px',
  '--rdp-day_button-height': '32px',
  '--rdp-day_button-width': '32px',
  '--rdp-day_button-border-radius': '6px',
  '--rdp-nav-height': '2rem',
  '--rdp-today-color': '#b85212',
  '--rdp-range_start-color': 'white',
  '--rdp-range_end-color': 'white',
  '--rdp-range_start-date-background-color': '#b85212',
  '--rdp-range_end-date-background-color': '#b85212',
  '--rdp-range_middle-background-color': 'rgba(184, 82, 18, 0.12)',
  '--rdp-selected-border': '2px solid #b85212',
  // Set base font on root so all children inherit Plus Jakarta Sans
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

// Inline style overrides per element — always beat stylesheet rules
const RDP_STYLES = {
  root: RDP_VARS,
  // Center the month container so caption + grid share the same horizontal axis
  month: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  // Override the default `font-size: large; font-weight: bold` on month_caption
  month_caption: { width: '100%', fontSize: '13px', fontWeight: '700', letterSpacing: '-0.01em', fontFamily: "'Plus Jakarta Sans', sans-serif" },
  caption_label: { fontSize: '13px', fontWeight: '700', fontFamily: "'Plus Jakarta Sans', sans-serif" },
  month_grid: { margin: '0 auto' },
  day_button: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '12px' },
  // Weekday headers: smaller, spaced, uppercase
  weekday: { fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' },
};

export function DateRangePicker({ dateFrom, dateTo, onRangeChange, align = 'right' }) {
  const [open, setOpen] = useState(false);
  // draft: the in-flight selection while the picker is open.
  // Isolated from parent so mid-selection state doesn't re-render DayPicker.
  const [draft, setDraft] = useState(null);
  const ref = useRef(null);

  const fromDate = parseLocalDate(dateFrom);
  const toDate = parseLocalDate(dateTo);
  const committedRange = (fromDate || toDate) ? { from: fromDate, to: toDate } : undefined;
  const hasRange = !!(dateFrom || dateTo);
  const label = formatRangeLabel(fromDate, toDate);

  // Hint shown inside the picker while the user has picked a start but not yet an end
  const awaitingEnd = open && draft?.from && !draft?.to;

  const applyDraft = useCallback((d) => {
    onRangeChange({
      from: toDateString(d?.from),
      to: toDateString(d?.to),
    });
  }, [onRangeChange]);

  const closeAndApply = useCallback((d) => {
    if (d !== null) applyDraft(d);
    setOpen(false);
    setDraft(null);
  }, [applyDraft]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        // Outside click: apply whatever is in draft (even partial "from only") and close
        closeAndApply(draft);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, draft, closeAndApply]);

  function handleButtonClick() {
    if (open) {
      // Clicking the button again while open → close and apply draft
      closeAndApply(draft);
    } else {
      // Opening → seed draft from current committed range so existing selection is visible
      setDraft(committedRange ?? null);
      setOpen(true);
    }
  }

  function handleSelect(newRange) {
    // Treat same-day from==to as "just start selected, no end yet"
    const fromMs = newRange?.from?.getTime();
    const toMs = newRange?.to?.getTime();
    const isCompleteRange = fromMs && toMs && fromMs !== toMs;

    if (isCompleteRange) {
      // Both ends chosen → apply immediately and close
      applyDraft(newRange);
      setOpen(false);
      setDraft(null);
    } else {
      // Partial selection (start only, or same-day click) → keep open, update draft
      setDraft(newRange ?? null);
    }
  }

  function clearRange(e) {
    e.stopPropagation();
    onRangeChange({ from: '', to: '' });
    setDraft(null);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleButtonClick}
        aria-label="Filter by date range"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex items-center gap-1.5 font-mono text-[12px] px-3 py-[7px] border rounded-md transition-colors focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 ${
          hasRange
            ? 'border-accent/40 text-accent bg-accent/5'
            : 'border-chrome-border text-chrome-muted bg-chrome-bg hover:border-chrome-muted hover:bg-chrome-deep'
        }`}
      >
        <CalendarIcon />
        {/* Show range label always when active; placeholder only on sm+ */}
        <span className={hasRange ? undefined : 'hidden sm:inline'}>{label ?? 'Date range'}</span>
        {hasRange && (
          <span
            role="button"
            tabIndex={0}
            onClick={clearRange}
            onKeyDown={(e) => e.key === 'Enter' && clearRange(e)}
            aria-label="Clear date range"
            className="leading-none text-chrome-muted hover:text-chrome-text transition-colors cursor-pointer"
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Date range picker"
          // align='right' → right-align with button (desktop toolbar); align='left' → left-align (bottom sheet)
          // max-w prevents overflow on very small screens
          className={`absolute top-full mt-1.5 z-50 bg-chrome-surface border border-chrome-border rounded-lg shadow-lg p-3 max-w-[calc(100vw-2rem)] ${align === 'left' ? 'left-0' : 'right-0'}`}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <DayPicker
              mode="range"
              navLayout="around"
              selected={draft ?? undefined}
              onSelect={handleSelect}
              styles={RDP_STYLES}
              fixedWeeks
              showOutsideDays
              startMonth={new Date(2024, 0, 1)}
            />
          </div>
          {/* Step hint */}
          <p className={`text-[11px] text-center pb-0.5 transition-colors ${awaitingEnd ? 'text-accent/70' : 'text-chrome-muted/50'}`}>
            {awaitingEnd ? 'Now pick an end date' : 'Pick a start date'}
          </p>
        </div>
      )}
    </div>
  );
}
