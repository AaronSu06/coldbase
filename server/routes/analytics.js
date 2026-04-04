import { Router } from 'express';
import { prisma, Prisma } from '../lib/prisma.js';

const router = Router();

// Thresholds — tune these once you have real user data
const BEST_TIME_MIN_SENT = 20;
const BEST_TIME_MIN_REPLIED = 5;
const RESPONSE_TIME_MIN_REPLIED = 10;
const REPLY_TREND_MIN_SENT = 10;
const REPLY_TREND_MIN_DAYS = 30;

// GET / — unified insights endpoint
// Mounted at /api/insights, so full path is GET /api/insights
// Query params: from=YYYY-MM-DD, to=YYYY-MM-DD (both optional, default = all-time)
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to + 'T23:59:59.999Z') : null;

    if ((fromDate && isNaN(fromDate)) || (toDate && isNaN(toDate))) {
      return res.status(400).json({ error: 'Validation Error', message: 'Invalid date format for from/to params' });
    }

    // Build reusable date clauses for $queryRaw
    const fromClause = fromDate ? Prisma.sql`AND "sentDate" >= ${fromDate}` : Prisma.sql``;
    const toClause = toDate ? Prisma.sql`AND "sentDate" <= ${toDate}` : Prisma.sql``;

    // ── Totals (always reflect the date window) ───────────────────────────
    const whereDate = {
      userId,
      archived: false,
      ...(fromDate && { sentDate: { gte: fromDate } }),
      ...(toDate && { sentDate: { lte: toDate } }),
    };
    const totalSent = await prisma.outreach.count({ where: whereDate });
    const totalReplied = await prisma.outreach.count({
      where: { ...whereDate, repliedAt: { not: null } },
    });

    // ── Best Time to Send ─────────────────────────────────────────────────
    let bestTime;
    if (totalSent < BEST_TIME_MIN_SENT || totalReplied < BEST_TIME_MIN_REPLIED) {
      bestTime = { insufficient: true, sent: totalSent, replied: totalReplied };
    } else {
      const rows = await prisma.$queryRaw`
        SELECT
          EXTRACT(HOUR FROM "sentDate")::INTEGER AS hour,
          COUNT(*) AS sent_count,
          SUM(CASE WHEN "repliedAt" IS NOT NULL THEN 1 ELSE 0 END)::INTEGER AS replied_count
        FROM "Outreach"
        WHERE archived = false AND "userId" = ${userId} ${fromClause} ${toClause}
        GROUP BY hour
        ORDER BY hour
      `;
      bestTime = {
        insufficient: false,
        data: rows.map(r => ({
          hour: Number(r.hour),
          sentCount: Number(r.sent_count),
          repliedCount: Number(r.replied_count),
          replyRate: Number(r.sent_count) > 0 ? Number(r.replied_count) / Number(r.sent_count) : 0,
        })),
      };
    }

    // ── Average Response Time ─────────────────────────────────────────────
    let responseTime;
    if (totalReplied < RESPONSE_TIME_MIN_REPLIED) {
      responseTime = { insufficient: true, sent: totalSent, replied: totalReplied };
    } else {
      const weeklyRows = await prisma.$queryRaw`
        SELECT
          DATE_TRUNC('week', "sentDate") AS week,
          AVG(EXTRACT(EPOCH FROM ("repliedAt" - "sentDate")) / 3600.0) AS avg_hours,
          COUNT(*) AS sample_size
        FROM "Outreach"
        WHERE "repliedAt" IS NOT NULL AND archived = false AND "userId" = ${userId} ${fromClause} ${toClause}
        GROUP BY week
        ORDER BY week
      `;
      const weeks = weeklyRows.map(r => ({
        week: r.week.toISOString().slice(0, 10),
        avgHours: Number(r.avg_hours),
      }));
      const totalSampleSize = weeklyRows.reduce((s, r) => s + Number(r.sample_size), 0);
      const weightedSum = weeklyRows.reduce((s, r) => s + Number(r.avg_hours) * Number(r.sample_size), 0);
      responseTime = {
        insufficient: false,
        avgHours: totalSampleSize > 0 ? weightedSum / totalSampleSize : 0,
        sampleSize: totalSampleSize,
        weeks,
      };
    }

    // ── Reply Rate Trend (weekly) ─────────────────────────────────────────
    let replyTrend;
    // Determine effective date range for the 30-day minimum check
    const effectiveFrom = fromDate ?? (await prisma.outreach.findFirst({
      where: { archived: false, userId },
      orderBy: { sentDate: 'asc' },
      select: { sentDate: true },
    }))?.sentDate;
    const effectiveTo = toDate ?? new Date();
    const daySpan = effectiveFrom
      ? (effectiveTo - effectiveFrom) / (1000 * 60 * 60 * 24)
      : 0;

    if (totalSent < REPLY_TREND_MIN_SENT || daySpan < REPLY_TREND_MIN_DAYS) {
      replyTrend = { insufficient: true, sent: totalSent, replied: totalReplied };
    } else {
      const trendRows = await prisma.$queryRaw`
        SELECT
          DATE_TRUNC('week', "sentDate") AS week,
          COUNT(*) AS sent,
          SUM(CASE WHEN "repliedAt" IS NOT NULL THEN 1 ELSE 0 END)::INTEGER AS replied
        FROM "Outreach"
        WHERE archived = false AND "userId" = ${userId} ${fromClause} ${toClause}
        GROUP BY week
        ORDER BY week
      `;
      replyTrend = {
        insufficient: false,
        data: trendRows.map(r => ({
          week: r.week.toISOString().slice(0, 10),
          sent: Number(r.sent),
          replied: Number(r.replied),
          rate: Number(r.sent) > 0 ? Number(r.replied) / Number(r.sent) : 0,
        })),
      };
    }

    res.json({ sent: totalSent, replied: totalReplied, bestTime, responseTime, replyTrend });
  } catch (e) {
    next(e);
  }
});

export default router;
