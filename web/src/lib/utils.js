// Left-border color per kanban status
export const STATUS_COLORS = {
  Sent:         '#3b82f6',
  Replied:      '#8b5cf6',
  Applied:      '#8b5cf6',
  Interviewing: '#f59e0b',
  Offer:        '#10b981',
  Ghosted:      '#ef4444',
};

export function getDaysSince(sentDateISO) {
  return Math.floor((Date.now() - new Date(sentDateISO)) / 86400000);
}

export function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
