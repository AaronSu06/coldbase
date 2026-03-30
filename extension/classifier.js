import { logger } from './logger-esm.js';

const log = logger('classifier');

const GENERIC_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'icloud.com', 'me.com', 'live.com', 'msn.com',
  'protonmail.com', 'aol.com'
]);

export function isGenericDomain(emailAddress) {
  const domain = (emailAddress.split('@')[1] || '').toLowerCase();
  return GENERIC_DOMAINS.has(domain);
}

const KEYWORD_GROUPS = [
  { key: 'intern', variants: ['intern', 'interns', 'interned', 'interning', 'internship', 'internships'] },
  { key: 'coop', variants: ['coop'] },
  { key: 'fulltime', variants: ['fulltime'] },
  { key: 'parttime', variants: ['parttime'] },
  { key: 'candidate', variants: ['candidate', 'candidates'] },
  { key: 'hiring', variants: ['hiring', 'hire', 'hired'] },
  { key: 'recruit', variants: ['recruit', 'recruiter', 'recruiting', 'recruitment'] },
  { key: 'apply', variants: ['apply', 'application', 'applications'] },
  { key: 'resume', variants: ['resume', 'resumes', 'cv'] },
];

function normalizeText(text) {
  return text.toLowerCase().replace(/[-_]/g, '').replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

function editDistanceWithinLimit(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  if (a === b) return true;
  if (limit === 0) return false;

  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, i) => i);
  let curr = new Array(cols);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }

    if (rowMin > limit) return false;
    [prev, curr] = [curr, prev];
  }

  return prev[b.length] <= limit;
}

function tokenMatchesVariant(token, variant) {
  if (token === variant) return true;
  const limit = variant.length >= 9 ? 2 : variant.length >= 5 ? 1 : 0;
  return editDistanceWithinLimit(token, variant, limit);
}

function hasGroupMatch(tokenSet, variants) {
  for (const token of tokenSet) {
    for (const variant of variants) {
      if (tokenMatchesVariant(token, variant)) return true;
    }
  }
  return false;
}

export function countKeywordMatches(text) {
  const tokens = new Set(tokenize(text));
  let count = 0;
  for (const group of KEYWORD_GROUPS) {
    if (hasGroupMatch(tokens, group.variants)) count++;
  }
  return count;
}

export function isColdOutreach(body) {
  // One strong job-related keyword (intern, apply, recruit, etc.) is sufficient
  // signal — requiring 2 caused casual coffee-chat / opportunity emails to be skipped.
  return countKeywordMatches(body) >= 1;
}

export function extractCompanyFromEmail(emailAddress) {
  // rachel@rocketbrew.com → "Rocketbrew"
  // john@mail.stripe.com → "Stripe" (use part before TLD, not first subdomain)
  const domain = emailAddress.split('@')[1] || '';
  const parts = domain.split('.');
  const name = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const SKIP_WORDS = new Set([
  'I', 'Hi', 'The', 'For', 'Our', 'Your', 'We', 'My', 'In', 'On',
  'An', 'A', 'To', 'From', 'Best', 'Thank', 'Thanks', 'Dear',
  'Summer', 'Winter', 'Spring', 'Fall', 'Internship', 'Opportunity',
  'Position', 'Role', 'Job', 'Team'
]);

// Lowercase stop words for body tokenisation (suppresses common English words as candidates)
const STOP_WORDS = new Set([
  'i', 'hi', 'the', 'for', 'our', 'your', 'we', 'my', 'in', 'on', 'an', 'a',
  'to', 'from', 'best', 'thank', 'thanks', 'dear', 'and', 'or', 'but', 'if',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no',
  'so', 'than', 'too', 'just', 'as', 'of', 'at', 'by', 'about', 'into',
  'through', 'before', 'after', 'up', 'out', 'over', 'then', 'once', 'here',
  'there', 'when', 'where', 'how', 'all', 'any', 'this', 'that', 'these',
  'those', 'with', 'it', 'he', 'she', 'they', 'them', 'what', 'who', 'you',
  'him', 'his', 'her', 'us', 'me', 'its', 'their',
]);

const ROLE_NOUNS = new Set([
  'ceo', 'cto', 'cfo', 'coo', 'vp', 'founder', 'president',
  'director', 'head', 'manager', 'owner',
]);

// Returns candidates sorted by score descending. Pure function — no I/O.
function scoreBodyCandidates(body) {
  const words = body.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const scores = new Map();

  for (let i = 0; i < words.length; i++) {
    for (let len = 1; len <= 3; len++) {
      if (i + len > words.length) break;
      const first = words[i];
      if (STOP_WORDS.has(first) || first.length <= 2) continue;

      const phrase = words.slice(i, i + len).join(' ');
      let score = (scores.get(phrase) || 0) + 1; // +1 per occurrence

      // +2 if within 6 tokens of a role noun
      const lo = Math.max(0, i - 6);
      const hi = Math.min(words.length, i + len + 6);
      if (words.slice(lo, hi).some(w => ROLE_NOUNS.has(w))) score += 2;

      scores.set(phrase, score);
    }
  }

  return Array.from(scores.entries())
    .map(([phrase, score]) => ({ phrase, score }))
    .sort((a, b) => b.score - a.score);
}

// Query Clearbit autocomplete by company name (not domain).
// Returns the official company name if a close match is found, else null.
async function fetchClearbitByName(query) {
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(2000) }
    );
    const data = await res.json();
    const q = query.toLowerCase();
    const match = data.find(c =>
      c.name?.toLowerCase().startsWith(q) || q.startsWith(c.name?.toLowerCase() || '')
    );
    return match?.name || null;
  } catch (err) {
    log.error('fetchClearbitByName failed for query', query, err);
    return null;
  }
}

// Match up to 3 consecutive capitalized words (e.g. "Jane Street Capital")
const COMPANY_PATTERN = /[A-Z][A-Za-z0-9.]+(?:\s[A-Z][A-Za-z0-9.]+){0,2}/;

function matchCompany(text, pattern) {
  const m = text.match(pattern);
  if (!m) return null;
  const name = m[1];
  return name && !SKIP_WORDS.has(name.split(' ')[0]) ? name : null;
}

export function extractCompanyFromText(subject, body) {
  // "[Company Name]" bracket pattern in subject — highest confidence
  const bracketMatch = subject.match(/\[([A-Z][A-Za-z0-9. ]+)\]/);
  if (bracketMatch) {
    const name = bracketMatch[1].trim();
    if (!SKIP_WORDS.has(name.split(' ')[0])) return name;
  }

  // "at [Company]" in body
  const atMatch = matchCompany(body, new RegExp(`\\bat\\s+(${COMPANY_PATTERN.source})`));
  if (atMatch) return atMatch;

  // "from [Company]" in body
  const fromMatch = matchCompany(body, new RegExp(`\\bfrom\\s+(${COMPANY_PATTERN.source})`));
  if (fromMatch) return fromMatch;

  // "on behalf of [Company]" in body
  const onBehalfMatch = matchCompany(body, new RegExp(`\\bon behalf of\\s+(${COMPANY_PATTERN.source})`));
  if (onBehalfMatch) return onBehalfMatch;

  // "Company -" subject prefix (company name before dash)
  const subjectPrefixMatch = subject.match(new RegExp(`^(${COMPANY_PATTERN.source})\\s*[-–]`));
  if (subjectPrefixMatch) {
    const name = subjectPrefixMatch[1];
    if (!SKIP_WORDS.has(name.split(' ')[0])) return name;
  }

  // "- Company" in subject (e.g. "Internship - Jane Street Capital")
  const subjectSuffixMatch = subject.match(new RegExp(`[-–]\\s*(${COMPANY_PATTERN.source})`));
  if (subjectSuffixMatch) {
    const name = subjectSuffixMatch[1];
    if (!SKIP_WORDS.has(name.split(' ')[0])) return name;
  }

  return null;
}

export async function fetchClearbitCompany(domain) {
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(domain)}`,
      { signal: AbortSignal.timeout(2000) }
    );
    const data = await res.json();
    const match = data.find(c => c.domain === domain || domain.endsWith(c.domain));
    return match?.name || null;
  } catch (err) {
    log.error('fetchClearbitCompany failed for domain', domain, err);
    return null;
  }
}

export function extractFirstName(toHeader) {
  // "Rachel Smith <rachel@rocketbrew.com>" → "Rachel"
  const match = toHeader.match(/^([A-Z][a-z]+)/);
  return match?.[1] || toHeader.split('@')[0].split('.')[0];
}
