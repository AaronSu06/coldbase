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

export function formatShortDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
