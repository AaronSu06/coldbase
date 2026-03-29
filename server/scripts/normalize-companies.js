/**
 * One-time migration: normalize company names to canonical casing.
 *
 * For each user, groups records by lowercased company name. For groups with
 * inconsistent casing (e.g. "openai" vs "OpenAI"), picks the canonical name by:
 *   1. Clearbit API lookup via the domain on the record
 *   2. Best-looking existing casing (most uppercase letters / not all-lowercase)
 *   3. Title-case fallback
 *
 * Run with: node scripts/normalize-companies.js
 * Safe to re-run — uses dry-run mode by default. Pass --apply to commit changes.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = !process.argv.includes('--apply');

async function fetchClearbitCompany(domain) {
  try {
    const res = await fetch(
      `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(domain)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    const data = await res.json();
    const match = data.find(c => c.domain === domain || domain.endsWith(c.domain));
    return match?.name || null;
  } catch {
    return null;
  }
}

function bestCasing(names) {
  // Prefer names that aren't all-lowercase and have some uppercase in them
  const scored = names.map(n => ({
    name: n,
    score: (n.match(/[A-Z]/g) || []).length,
    isAllLower: n === n.toLowerCase(),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0].name;
}

function titleCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

async function run() {
  console.log(`Running in ${DRY_RUN ? 'DRY RUN' : 'APPLY'} mode.\n`);

  const records = await prisma.outreach.findMany({
    select: { id: true, userId: true, company: true, domain: true },
  });

  // Group by userId + lowercased company
  const groups = new Map();
  for (const r of records) {
    const key = `${r.userId}::${r.company.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let updated = 0;

  for (const [, group] of groups) {
    const uniqueNames = [...new Set(group.map(r => r.company))];

    // Check if all records in this group already share the same name
    if (uniqueNames.length === 1 && uniqueNames[0] !== uniqueNames[0].toLowerCase()) {
      // Already consistently cased and not all-lowercase — skip
      continue;
    }

    // Determine canonical name
    let canonical = null;

    // 1. Try Clearbit using the domain from the first record
    const domain = group[0].domain;
    if (domain && domain !== 'unknown') {
      canonical = await fetchClearbitCompany(domain);
    }

    // 2. Best existing casing
    if (!canonical) {
      canonical = bestCasing(uniqueNames);
    }

    // 3. Title-case fallback if still all-lowercase
    if (canonical === canonical.toLowerCase()) {
      canonical = titleCase(canonical);
    }

    // Find records that need updating
    const toUpdate = group.filter(r => r.company !== canonical);
    if (toUpdate.length === 0) continue;

    console.log(
      `[${group[0].userId}] "${uniqueNames.join('", "')}" → "${canonical}" (${toUpdate.length} record${toUpdate.length !== 1 ? 's' : ''})`
    );

    if (!DRY_RUN) {
      await prisma.outreach.updateMany({
        where: { id: { in: toUpdate.map(r => r.id) } },
        data: { company: canonical },
      });
    }

    updated += toUpdate.length;
  }

  console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${updated} record(s).`);
  if (DRY_RUN) console.log('Re-run with --apply to commit changes.');

  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
