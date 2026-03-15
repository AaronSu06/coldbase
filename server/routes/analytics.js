import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET /best-time — aggregated send/reply data by hour
// Mounted at /api/insights in index.js, so full path is GET /api/insights/best-time
router.get('/best-time', async (req, res, next) => {
  try {
    const total = await prisma.outreach.count();
    const replied = await prisma.outreach.count({ where: { repliedAt: { not: null } } });
    if (total < 20 || replied < 5) {
      return res.json({ insufficient: true, sent: total, replied });
    }
    const rows = await prisma.$queryRaw`
      SELECT
        CAST(strftime('%H', sentDate) AS INTEGER) AS hour,
        COUNT(*) AS sent_count,
        SUM(CASE WHEN repliedAt IS NOT NULL THEN 1 ELSE 0 END) AS replied_count
      FROM Outreach
      WHERE archived = 0
      GROUP BY hour
      ORDER BY hour
    `;
    const data = rows.map(r => ({
      hour: Number(r.hour),
      sentCount: Number(r.sent_count),
      repliedCount: Number(r.replied_count),
      replyRate: Number(r.sent_count) > 0 ? Number(r.replied_count) / Number(r.sent_count) : 0,
    }));
    res.json({ insufficient: false, data, sent: total, replied });
  } catch (e) {
    next(e);
  }
});

export default router;
