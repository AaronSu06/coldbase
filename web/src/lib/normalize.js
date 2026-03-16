// web/src/lib/normalize.js
// Pure status normalization — COLUMNS defined inline for Node test runner compatibility

const COLUMNS = ['Sent', 'Replied', 'Interviewing', 'Offer', 'Ghosted'];

export { COLUMNS };

export function normalizeStatus(status) {
  if (status === 'Applied') return 'Sent';
  return COLUMNS.includes(status) ? status : 'Sent';
}
