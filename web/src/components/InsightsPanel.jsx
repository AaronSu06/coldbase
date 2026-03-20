import { useState, useEffect } from 'react';
import { fetchBestTime } from '../lib/api';

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

export default function InsightsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchBestTime()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-chrome-muted text-sm">
        Loading insights…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">
        Failed to load insights. Please refresh.
      </div>
    );
  }

  if (!data) return null;

  if (data.insufficient) {
    const ghostHeights = Array.from({ length: 24 }, (_, i) => {
      const morning = Math.exp(-Math.pow(i - 10, 2) / 8);
      const afternoon = Math.exp(-Math.pow(i - 14, 2) / 8);
      return Math.max(morning, afternoon) * 75 + 8;
    });

    return (
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <StatsRow sent={data.sent} replied={data.replied} />
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="font-display text-[18px] font-bold text-chrome-text mb-0.5">Best Time to Send</h2>
            <p className="text-xs text-chrome-muted">Hours shown in UTC</p>
          </div>
        </div>

        {/* Ghost chart with overlay */}
        <div className="relative">
          {/* Dimmed ghost bars */}
          <div className="flex items-end gap-1 h-40 mb-2 opacity-25 pointer-events-none select-none">
            {ghostHeights.map((h, i) => (
              <div key={i} className="flex-1">
                <div
                  className="w-full rounded-t bg-chrome-surface"
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>

          {/* X-axis labels (also dimmed) */}
          <div className="flex gap-1 text-[9px] text-chrome-muted font-mono opacity-25 pointer-events-none select-none mb-2">
            {ghostHeights.map((_, i) => (
              <div key={i} className="flex-1 text-center">
                {i % 6 === 0 ? formatHour(i) : ''}
              </div>
            ))}
          </div>

          {/* Centered overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
            <p className="font-sans font-semibold text-[13px] text-chrome-text">
              Unlock send-time insights
            </p>
            <p className="text-[11px] text-chrome-muted font-mono">
              {data.sent} / 20 emails sent · {data.replied} / 5 replies
            </p>
          </div>
        </div>
      </div>
    );
  }

  const maxRate = Math.max(...data.data.map(d => d.replyRate), 0.001);
  const sorted = [...data.data].sort((a, b) => b.replyRate - a.replyRate);
  const top3Hours = new Set(sorted.slice(0, 3).map(d => d.hour));

  // Build 24-slot array (fill missing hours with 0)
  const hourMap = Object.fromEntries(data.data.map(d => [d.hour, d]));
  const hours = Array.from({ length: 24 }, (_, i) => hourMap[i] || { hour: i, sentCount: 0, repliedCount: 0, replyRate: 0 });

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto overflow-y-auto h-full">
      <StatsRow sent={data.sent} replied={data.replied} />
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-display text-[18px] font-bold text-chrome-text mb-0.5">Best Time to Send</h2>
          <p className="text-xs text-chrome-muted">Hours shown in UTC</p>
        </div>
      </div>

      {/* Bar chart */}
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
              {/* Tooltip */}
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

      {/* X-axis labels */}
      <div className="flex gap-1 text-[9px] text-chrome-muted font-mono">
        {hours.map((h, i) => (
          <div key={h.hour} className="flex-1 text-center">
            {i % 6 === 0 ? formatHour(h.hour) : ''}
          </div>
        ))}
      </div>

      {/* Top hours legend */}
      {sorted.length > 0 && sorted[0].sentCount > 0 && (
        <div className="mt-6">
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
    </div>
  );
}
