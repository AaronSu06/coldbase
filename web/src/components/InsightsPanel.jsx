import { useState } from 'react';
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DateRangePicker } from './DateRangePicker';

const ACCENT      = '#b85212';
const MUTED       = '#78716c';
const BORDER      = '#e8e6e1';
const TOOLTIP_BG  = '#1a1917';
const MONO        = 'IBM Plex Mono, monospace';

function formatHour(h) {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function fmtHours(h) {
  return h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`;
}

const tickStyle = { fontSize: 10, fill: MUTED, fontFamily: MONO };
const tooltipContentStyle = {
  background: TOOLTIP_BG, border: 'none', borderRadius: 6, padding: '6px 10px',
};
const tooltipLabelStyle = { color: MUTED, fontSize: 11, fontFamily: MONO };
const tooltipItemStyle  = { color: '#f8f7f5', fontSize: 11 };

function StatsRow({ sent, replied }) {
  const rate = sent > 0 ? Math.round((replied / sent) * 100) : 0;
  const stats = [
    { label: 'Total Sent', value: sent },
    { label: 'Reply Rate', value: `${rate}%` },
    { label: 'Replies', value: replied },
  ];
  return (
    <div className="flex gap-3 sm:gap-6">
      {stats.map(s => (
        <div key={s.label} className="flex flex-col gap-0.5">
          <span className="text-[9px] sm:text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted">
            {s.label}
          </span>
          <span className="font-mono text-[18px] sm:text-[22px] font-medium text-chrome-text leading-none">
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
    <div className="flex items-end gap-1 h-32 sm:h-40 opacity-20 pointer-events-none select-none">
      {ghostHeights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-chrome-muted"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

// Ghost placeholder that mimics an AreaChart (for Reply Rate Trend locked state)
function GhostArea() {
  return (
    <svg viewBox="0 0 100 60" className="w-full h-32 sm:h-40 opacity-20" preserveAspectRatio="none">
      <path
        d="M 0 40 C 12 40, 18 18, 33 24 S 52 46, 68 30 S 88 14, 100 20 L 100 60 L 0 60 Z"
        className="fill-chrome-muted"
      />
      <path
        d="M 0 40 C 12 40, 18 18, 33 24 S 52 46, 68 30 S 88 14, 100 20"
        fill="none" stroke="currentColor" strokeWidth="1.5" className="text-chrome-muted"
      />
    </svg>
  );
}

// Ghost placeholder that mimics a BarChart (for Avg Response Time locked state)
function GhostBars() {
  const heights = [35, 55, 45, 70, 40, 60, 50, 65];
  return (
    <div className="flex items-end gap-1.5 h-32 sm:h-40 opacity-20 pointer-events-none select-none">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-chrome-muted"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function BestTimeSlide({ data }) {
  if (data.insufficient) {
    return (
      <div className="relative min-h-[160px] sm:min-h-[180px]">
        <GhostChart />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <p className="font-sans font-semibold text-[13px] text-chrome-text">
            Send 20 emails to reveal your best times
          </p>
          <p className="text-[11px] text-chrome-muted font-sans">
            {data.sent} of 20 sent · {data.replied} of 5 replied
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
      <div className="flex items-end gap-1 h-32 sm:h-40 mb-2">
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
                  isTop && h.sentCount > 0 ? 'bg-accent' : 'bg-chrome-border'
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
      <div className="flex gap-1 text-[9px] text-chrome-muted font-mono mb-4 sm:mb-6">
        {hours.map((h, i) => (
          <div key={h.hour} className="flex-1 text-center">
            {i % 6 === 0 ? formatHour(h.hour) : ''}
          </div>
        ))}
      </div>
      {sorted.length > 0 && sorted[0].sentCount > 0 && (
        <div>
          <p className="font-sans text-[10px] font-semibold text-chrome-muted uppercase tracking-[0.1em] mb-2">Top send windows</p>
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            {sorted.slice(0, 3).filter(d => d.sentCount > 0).map((d, i) => (
              <div key={d.hour} className="flex items-center gap-1.5 sm:gap-2 bg-accent/10 text-accent rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
                <span className="font-mono text-[11px] text-accent/60">#{i + 1}</span>
                <span className="font-semibold text-xs sm:text-sm">{formatHour(d.hour)}</span>
                <span className="hidden sm:inline text-[11px] text-accent/80">{Math.round(d.replyRate * 100)}% reply rate</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ResponseTimeSlide({ data }) {
  if (data.insufficient) {
    return (
      <div className="relative min-h-[160px] sm:min-h-[180px]">
        <GhostBars />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <p className="font-sans font-semibold text-[13px] text-chrome-text">
            Your response time trend builds here
          </p>
          <p className="text-[11px] text-chrome-muted font-sans">
            {data.replied} of 10 replies in — {10 - data.replied} more to go
          </p>
        </div>
      </div>
    );
  }

  const weeks = data.weeks ?? [];

  if (weeks.length < 2) {
    const display = fmtHours(data.avgHours);
    return (
      <div className="flex flex-col items-center justify-center min-h-[160px] sm:min-h-[180px] gap-2">
        <p className="font-display text-[48px] sm:text-[56px] font-bold text-chrome-text leading-none">{display}</p>
        <p className="text-[12px] text-chrome-muted uppercase tracking-[0.08em] font-semibold">avg. response time</p>
        <p className="text-[11px] text-chrome-muted mt-1">based on {data.sampleSize} {data.sampleSize === 1 ? 'reply' : 'replies'}</p>
      </div>
    );
  }

  const chartData = weeks.map(w => ({
    week: w.week.slice(5),
    hours: parseFloat(w.avgHours.toFixed(1)),
  }));

  return (
    <div className="min-h-[160px] sm:min-h-[180px]">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis dataKey="week" tick={tickStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={fmtHours} tick={tickStyle} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            formatter={v => [fmtHours(v), 'Avg Response']}
          />
          <Bar dataKey="hours" fill={ACCENT} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[11px] text-chrome-muted text-center -mt-1">
        avg {fmtHours(data.avgHours)} · {data.sampleSize} {data.sampleSize === 1 ? 'reply' : 'replies'}
      </p>
    </div>
  );
}

function ReplyTrendSlide({ data }) {
  if (data.insufficient) {
    return (
      <div className="relative min-h-[160px] sm:min-h-[180px]">
        <GhostArea />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <p className="font-sans font-semibold text-[13px] text-chrome-text">
            Reply rate trend reveals itself over 30 days
          </p>
          <p className="text-[11px] text-chrome-muted font-sans">
            {data.sent} of 10 sent — keep the momentum going
          </p>
        </div>
      </div>
    );
  }

  const weeks = data.data;
  if (weeks.length === 0) return null;

  const chartData = weeks.map(w => ({
    week: w.week.slice(5),
    rate: parseFloat((w.rate * 100).toFixed(1)),
  }));

  return (
    <div className="min-h-[160px] sm:min-h-[180px]">
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="replyRateGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.2} />
              <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis dataKey="week" tick={tickStyle} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={v => `${v}%`} tick={tickStyle} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
            formatter={v => [`${v}%`, 'Reply Rate']}
          />
          <Area
            type="monotone"
            dataKey="rate"
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#replyRateGrad)"
            dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const SLIDES = [
  { key: 'bestTime',      label: 'Best Time to Send',     Component: BestTimeSlide },
  { key: 'responseTime',  label: 'Avg Response Time',     Component: ResponseTimeSlide },
  { key: 'replyTrend',    label: 'Reply Rate Trend',      Component: ReplyTrendSlide },
];

export default function InsightsPanel({ dateFrom, dateTo, data, loading, error, onRangeChange }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(null); // 'next' | 'prev' | null (initial)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-chrome-muted text-sm min-h-[340px]">
        Loading insights…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm min-h-[340px]">
        Failed to load insights. Please refresh.
      </div>
    );
  }

  if (!data) return null;

  const n = SLIDES.length;

  function navigate(d) {
    setDir(d);
    setIndex(i => d === 'next' ? (i + 1) % n : (i - 1 + n) % n);
  }

  function goTo(i) {
    if (i === index) return;
    setDir(i > index ? 'next' : 'prev');
    setIndex(i);
  }

  const { key, Component } = SLIDES[index];
  const animation = dir === 'next'
    ? 'slide-in-from-right 300ms ease-in-out'
    : dir === 'prev'
    ? 'slide-in-from-left 300ms ease-in-out'
    : undefined;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Top bar: stats (left) + date picker (right) */}
      <div className="flex items-start justify-between gap-4 mb-4 sm:mb-6">
        <div>
          <StatsRow sent={data.sent} replied={data.replied} />
          <p className="text-[11px] text-chrome-muted mt-1.5 font-mono">
            {dateFrom || dateTo
              ? `${dateFrom || '…'} – ${dateTo || 'today'}`
              : 'All time'}
          </p>
        </div>
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          onRangeChange={onRangeChange}
        />
      </div>

      {/* Slide heading */}
      <div className="mb-3 sm:mb-4">
        <h2 className="font-display text-[16px] sm:text-[18px] font-bold text-chrome-text">
          {SLIDES[index].label}
        </h2>
      </div>

      {/* Carousel: arrow — window — arrow */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => navigate('prev')}
          aria-label="Previous insight"
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-chrome-border text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors"
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>

        <div className="flex-1 overflow-hidden">
          {/* key changes on every navigation to re-trigger the CSS animation */}
          <div key={`${index}-${dir}`} style={{ animation }}>
            <Component data={data[key]} />
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('next')}
          aria-label="Next insight"
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-chrome-border text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors"
        >
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      {/* Slide position dots */}
      <div className="flex justify-center gap-2 mt-3" role="tablist" aria-label="Insight slides">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.key}
            role="tab"
            aria-selected={i === index}
            aria-label={slide.label}
            onClick={() => goTo(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 ${
              i === index ? 'bg-accent scale-125' : 'bg-chrome-border hover:bg-chrome-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
