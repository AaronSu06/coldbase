// server/cron/digestCron.js
import cron from 'node-cron';
import { Resend } from 'resend';
import { prisma } from '../lib/prisma.js';
import { buildDigestEmail, buildDigestEmailText } from '../emails/digestTemplate.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.DIGEST_FROM_EMAIL;
const DASHBOARD_URL = process.env.DASHBOARD_URL;

async function getUserStats(userId, frequency) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const windowDays = frequency === 'monthly' ? 30 : 7;
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - windowDays);

  const [totalContacts, followUpsDue, emailsSent, repliedCount] = await Promise.all([
    // All-time cumulative
    prisma.outreach.count({
      where: { userId, archived: false },
    }),
    // All-time cumulative
    prisma.outreach.count({
      where: { userId, archived: false, nextActionDate: { lte: today } },
    }),
    // This period only
    prisma.outreach.count({
      where: { userId, archived: false, sentDate: { gte: windowStart } },
    }),
    // This period only
    prisma.outreach.count({
      where: { userId, archived: false, repliedAt: { gte: windowStart } },
    }),
  ]);

  return {
    totalContacts,
    followUpsDue,
    emailsSent,
    windowDays,
    sendRate: totalContacts > 0 ? emailsSent / totalContacts : 0,
    replyRate: emailsSent > 0 ? repliedCount / emailsSent : null,
  };
}

async function sendDigests() {
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentDayOfMonth = now.getDate();

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { emailDigest: 'weekly',  digestSendDay: currentDayOfWeek },
        { emailDigest: 'monthly', digestSendDay: currentDayOfMonth },
      ],
    },
    select: { id: true, email: true, emailDigest: true },
  });

  console.log(`[digest] Running for ${users.length} user(s) on day ${currentDayOfWeek}/${currentDayOfMonth}`);

  for (const user of users) {
    try {
      const stats = await getUserStats(user.id, user.emailDigest);
      const html = buildDigestEmail({ frequency: user.emailDigest, stats, dashboardUrl: DASHBOARD_URL });
      const text = buildDigestEmailText({ frequency: user.emailDigest, stats, dashboardUrl: DASHBOARD_URL });
      const label = user.emailDigest === 'monthly' ? 'Monthly' : 'Weekly';

      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: `Your Coldbase ${label} Digest`,
        html,
        text,
      });

      console.log(`[digest] Sent to ${user.email}`);
    } catch (err) {
      console.error(`[digest] Failed for ${user.email}:`, err.message);
    }
  }
}

export function startDigestCron() {
  cron.schedule('0 9 * * *', sendDigests, { timezone: 'UTC' });
  console.log('[digest] Cron scheduled: daily at 09:00 UTC');
}

export { sendDigests };
