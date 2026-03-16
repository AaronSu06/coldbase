// extension/text-utils.js
// Pure text utilities — no imports, safe to run in Node test environment

export function extractEmailAddress(header) {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1] : header.trim();
}

export function normalizeForMatch(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[-_]/g, '')
    .replace(/[^a-z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
