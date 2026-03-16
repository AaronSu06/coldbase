import { logger } from './logger.js';

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
  const domain = emailAddress.split('@')[1] || '';
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const SKIP_WORDS = new Set([
  'I', 'Hi', 'The', 'For', 'Our', 'Your', 'We', 'My', 'In', 'On',
  'An', 'A', 'To', 'From', 'Best', 'Thank', 'Thanks', 'Dear',
  'Summer', 'Winter', 'Spring', 'Fall', 'Internship', 'Opportunity',
  'Position', 'Role', 'Job', 'Team'
]);

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

  // "with [Company]" in body
  const withMatch = matchCompany(body, new RegExp(`\\bwith\\s+(${COMPANY_PATTERN.source})`));
  if (withMatch) return withMatch;

  // "Company -" subject prefix (company name before dash)
  const subjectPrefixMatch = subject.match(new RegExp(`^(${COMPANY_PATTERN.source})\\s*[-–]`));
  if (subjectPrefixMatch) {
    const name = subjectPrefixMatch[1];
    if (!SKIP_WORDS.has(name.split(' ')[0])) return name;
  }

  // "- Company" in subject (e.g. "Internship - Google Summer 2026")
  const subjectSuffixMatch = subject.match(/[-–]\s*([A-Z][A-Za-z0-9.]+)/);
  if (subjectSuffixMatch && !SKIP_WORDS.has(subjectSuffixMatch[1])) return subjectSuffixMatch[1];

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
