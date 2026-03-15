import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

const router = Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const CreateOutreachSchema = z.object({
  threadId:     z.string().min(1),
  company:      z.string().min(1),
  contactEmail: z.string().email(),
}).passthrough();

const PatchOutreachSchema = CreateOutreachSchema.partial();

// ─── GET / — list with limit/offset pagination ────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const [records, total] = await Promise.all([
      prisma.outreach.findMany({ orderBy: { sentDate: 'desc' }, take: limit, skip: offset }),
      prisma.outreach.count(),
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
  try {
    const record = await prisma.outreach.create({ data: parsed.data });
    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
});

// ─── PATCH /:threadId — partial update with Zod validation ───────────────────

router.patch('/:threadId', async (req, res, next) => {
  const parsed = PatchOutreachSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation Error',
      message: parsed.error.issues.map(i => i.message).join('; '),
      statusCode: 400,
    });
  }
  try {
    const record = await prisma.outreach.update({
      where: { threadId: req.params.threadId },
      data: parsed.data,
    });
    res.json(record);
  } catch (e) {
    next(e);
  }
});

// ─── DELETE /:threadId ────────────────────────────────────────────────────────

router.delete('/:threadId', async (req, res, next) => {
  try {
    await prisma.outreach.delete({ where: { threadId: req.params.threadId } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

export default router;
