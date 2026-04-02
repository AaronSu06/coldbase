import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

// ─── Company canonicalization ─────────────────────────────────────────────────
// When storing a company name, check if the user already has a record with the
// same name (case-insensitive). If so, reuse the existing canonical casing so
// "openai" and "OpenAI" resolve to the same company.

async function resolveCanonicalCompany(userId, rawCompany) {
  const existing = await prisma.outreach.findFirst({
    where: { userId, company: { equals: rawCompany, mode: 'insensitive' } },
    orderBy: { sentDate: 'asc' }, // oldest = the original/canonical entry
    select: { company: true },
  });
  return existing?.company ?? rawCompany;
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const CreateOutreachSchema = z.object({
  threadId:     z.string().min(1),
  company:      z.string().min(1),
  contactEmail: z.string().email(),
}).passthrough();

const PatchOutreachSchema = CreateOutreachSchema.partial();

// ─── GET / — list with limit/offset pagination ────────────────────────────────

router.get('/', async (req, res, next) => {
  const { userId } = req.user;
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const [records, total] = await Promise.all([
      prisma.outreach.findMany({
        where: { userId },
        orderBy: { sentDate: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.outreach.count({ where: { userId } }),
    ]);
    res.json({ data: records, total });
  } catch (e) {
    next(e);
  }
});

// ─── POST / — create record with Zod validation ───────────────────────────────

router.post('/', async (req, res, next) => {
  const parsed = CreateOutreachSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }
  const { userId } = req.user;
  try {
    const company = await resolveCanonicalCompany(userId, parsed.data.company);
    const record = await prisma.outreach.create({ data: { ...parsed.data, company, userId } });
    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
});

// ─── GET /:threadId — single record ───────────────────────────────────────────

router.get('/:threadId', async (req, res, next) => {
  const { userId } = req.user;
  try {
    const record = await prisma.outreach.findFirst({
      where: { threadId: req.params.threadId, userId },
    });
    if (!record) return res.status(404).json({ error: 'Not Found' });
    res.json(record);
  } catch (e) {
    next(e);
  }
});

// ─── PATCH /:threadId ─────────────────────────────────────────────────────────

router.patch('/:threadId', async (req, res, next) => {
  const parsed = PatchOutreachSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }
  const { userId } = req.user;
  try {
    const existing = await prisma.outreach.findFirst({
      where: { threadId: req.params.threadId, userId },
    });
    if (!existing) return res.status(404).json({ error: 'Not Found' });
    // Strip system/immutable fields from the patch data
    const { userId: _u, id: _id, createdAt: _ca, updatedAt: _ua, ...patchData } = parsed.data;
    if (patchData.company) {
      patchData.company = await resolveCanonicalCompany(userId, patchData.company);
    }
    const record = await prisma.outreach.update({
      where: { id: existing.id },
      data: patchData,
    });
    res.json(record);
  } catch (e) {
    next(e);
  }
});

// ─── DELETE /:threadId ────────────────────────────────────────────────────────

router.delete('/:threadId', async (req, res, next) => {
  const { userId } = req.user;
  try {
    const existing = await prisma.outreach.findFirst({
      where: { threadId: req.params.threadId, userId },
    });
    if (!existing) return res.status(404).json({ error: 'Not Found' });
    await prisma.outreach.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ─── POST /backfill-gmail-urls — one-time migration ─────────────────────────

router.post('/backfill-gmail-urls', async (req, res, next) => {
  const { userId } = req.user;
  try {
    const records = await prisma.outreach.findMany({
      where: {
        userId,
        NOT: { threadId: { startsWith: 'reach_' } },
        OR: [
          { gmailUrl: { contains: '#sent' } },
          { gmailUrl: { contains: '#inbox' } },
          { gmailUrl: null },
        ],
      },
      select: { id: true, threadId: true },
    });
    let updated = 0;
    for (const r of records) {
      await prisma.outreach.update({
        where: { id: r.id },
        data: { gmailUrl: `https://mail.google.com/mail/u/0/#all/${r.threadId}` },
      });
      updated++;
    }
    res.json({ updated });
  } catch (e) {
    next(e);
  }
});

export default router;
