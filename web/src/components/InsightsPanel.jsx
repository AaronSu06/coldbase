import { useState, useEffect, useRef } from 'react';
import { fetchInsights } from '../lib/api';

function formatHour(h) {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

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

function GhostChart() {
  const ghostHeights = Array.from({ length: 24 }, (_, i) => {
    const morning = Math.exp(-Math.pow(i - 10, 2) / 8);
    const afternoon = Math.exp(-Math.pow(i - 14, 2) / 8);
    return Math.max(morning, afternoon) * 75 + 8;
  });
  return (
    <div className="relative">
      <div className="flex items-end gap-1 h-40 mb-2 pointer-events-none select-none">
        {ghostHeights.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-chrome-deep border border-chrome-rim"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="flex gap-1 text-[9px] text-chrome-muted font-mono opacity-40 pointer-events-none select-none mb-2">
        {ghostHeights.map((_, i) => (
          <div key={i} className="flex-1 text-center">
            {i % 6 === 0 ? formatHour(i) : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

function BestTimeSlide({ data }) {
  if (data.insufficient) {
    return (
      <div className="relative">
        <GhostChart />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <p className="font-sans font-semibold text-[13px] text-chrome-text">
            Unlock send-time insights
          </p>
          <p className="text-[11px] text-chrome-muted font-mono">
            {data.sent} / 20 emails sent · {data.replied} / 5 replies
          </p>
        </div>
      </div>
    );
  }

  const maxRate = Math.max(...data.data.map(d => d.replyRate), 0.001);
  const sorted = [...data.data].sort((a, b) => b.replyRate - a.replyRate);
  const top3Hours = new Set(sorted.slice(0, 3).map(d => d.hour));
  const hourMap = Object.fromEntries(data.data.map(d => [d.hour, d]));
  const hours = Array.from({ length: 24 }, (_, i) => hourMap[i] || { hour: i, sentCount: 0, repliedCount: 0, replyRate: 0 });

  return (
    <>
      <div className="flex items-end gap-1 h-40 mb-2">
        {hours.map(h => {
          const heightPct = maxRate > 0 ? (h.replyRate / maxRate) * 100 : 0;
          const isTop = top3Hours.has(h.hour);
          return (
            <div
              key={h.hour}
              className="flex-1 flex flex-col items-center group relative"
              title={`${formatHour(h.hour)}: ${h.sentCount} sent, ${h.repliedCount} replied (${Math.round(h.replyRate * 100)}%)`}
            >
              <div
                className={`w-full rounded-t transition-all duration-300 ${
                  isTop && h.sentCount > 0 ? 'bg-accent' : 'bg-chrome-surface'
                }`}
                style={{ height: `${Math.max(heightPct, h.sentCount > 0 ? 4 : 0)}%` }}
              />
              {h.sentCount > 0 && (
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-chrome-text text-chrome-bg text-[10px] rounded px-1.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10 transition-opacity">
                  {formatHour(h.hour)}<br />
                  {h.sentCount} sent · {h.repliedCount} replied<br />
                  {Math.round(h.replyRate * 100)}% rate
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 text-[9px] text-chrome-muted font-mono mb-6">
        {hours.map((h, i) => (
          <div key={h.hour} className="flex-1 text-center">
            {i % 6 === 0 ? formatHour(h.hour) : ''}
          </div>
        ))}
      </div>
      {sorted.length > 0 && sorted[0].sentCount > 0 && (
        <div>
          <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em] mb-2">Top send windows</p>
          <div className="flex gap-3 flex-wrap">
            {sorted.slice(0, 3).filter(d => d.sentCount > 0).map((d, i) => (
              <div key={d.hour} className="flex items-center gap-2 bg-accent/10 text-accent rounded-lg px-3 py-2">
                <span className="font-mono text-[11px] text-accent/60">#{i + 1}</span>
                <span className="font-semibold text-sm">{formatHour(d.hour)}</span>
                <span className="text-[11px] text-accent/80">{Math.round(d.replyRate * 100)}% reply rate</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ResponseTimeSlide({ data }) {
  return <div className="p-1 text-chrome-muted text-sm">Response Time slide — Task 6</div>;
}

function ReplyTrendSlide({ data }) {
  return <div className="p-1 text-chrome-muted text-sm">Reply Trend slide — Task 7</div>;
}

const SLIDES = [
  { key: 'bestTime',      label: 'Best Time to Send',     Component: BestTimeSlide },
  { key: 'responseTime',  label: 'Avg Response Time',     Component: ResponseTimeSlide },
  { key: 'replyTrend',    label: 'Reply Rate Trend',      Component: ReplyTrendSlide },
];

export default function InsightsPanel() {
  const [index, setIndex] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetchInsights({ from: dateFrom || undefined, to: dateTo || undefined })
        .then(setData)
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [dateFrom, dateTo]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-chrome-muted text-sm min-h-[220px]">
        Loading insights…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm min-h-[220px]">
        Failed to load insights. Please refresh.
      </div>
    );
  }

  if (!data) return null;

  const canPrev = index > 0;
  const canNext = index < SLIDES.length - 1;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      {/* Top bar: stats + date picker + navigation */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <StatsRow sent={data.sent} replied={data.replied} />
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-[11px] text-chrome-muted bg-chrome-deep border border-chrome-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            <span className="text-[11px] text-chrome-muted">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-[11px] text-chrome-muted bg-chrome-deep border border-chrome-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
          </div>
          {/* Arrow navigation */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={!canPrev}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-chrome-border text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Previous insight"
            >
              ‹
            </button>
            <span className="text-[11px] text-chrome-muted font-mono w-8 text-center">
              {index + 1} / {SLIDES.length}
            </span>
            <button
              type="button"
              onClick={() => setIndex(i => Math.min(SLIDES.length - 1, i + 1))}
              disabled={!canNext}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-chrome-border text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Next insight"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* Slide heading */}
      <div className="mb-4">
        <h2 className="font-display text-[18px] font-bold text-chrome-text mb-0.5">
          {SLIDES[index].label}
        </h2>
        <p className="text-xs text-chrome-muted">
          {dateFrom || dateTo
            ? `${dateFrom || 'all time'} – ${dateTo || 'today'}`
            : 'All time · UTC'}
        </p>
      </div>

      {/* Carousel window */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map(({ key, Component }) => (
            <div key={key} className="w-full flex-shrink-0">
              <Component data={data[key]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
