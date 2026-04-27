// server/emails/digestTemplate.js

/**
 * @param {object} opts
 * @param {string} opts.frequency  - 'weekly' | 'monthly'
 * @param {object} opts.stats
 * @param {number} opts.stats.totalContacts
 * @param {number} opts.stats.followUpsDue
 * @param {number} opts.stats.emailsSent
 * @param {number} opts.stats.windowDays
 * @param {number} opts.stats.sendRate    - 0–1
 * @param {number|null} opts.stats.replyRate  - 0–1, or null if no emails sent
 * @param {string} opts.dashboardUrl
 * @returns {string} HTML string
 */
export function buildDigestEmail({ frequency, stats, dashboardUrl }) {
  const label = frequency === 'monthly' ? 'Monthly' : 'Weekly';
  const pct = (rate) => rate != null ? `${Math.round(rate * 100)}%` : '—';

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - stats.windowDays);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const periodLabel = `${fmt(windowStart)}–${fmt(now)}`;

  const statCards = [
    { label: 'Follow-ups due', value: stats.followUpsDue, note: 'all time' },
    { label: 'Total contacts', value: stats.totalContacts, note: 'all time' },
    { label: 'Emails sent', value: stats.emailsSent, note: periodLabel },
    ...(stats.replyRate != null
      ? [{ label: 'Reply rate', value: pct(stats.replyRate), note: periodLabel }]
      : []),
  ];

  const cardHtml = statCards.map(({ label, value, note }) => `
    <td style="padding:0 10px 0 0;vertical-align:top;">
      <div style="background:#ffffff;border:1px solid #e8e6e1;border-radius:10px;padding:16px 20px;min-width:90px;box-shadow:0 1px 2px rgba(0,0,0,0.05),0 2px 8px rgba(0,0,0,0.04);">
        <div style="font-size:22px;font-weight:700;color:#1a1917;line-height:1.1;">${value}</div>
        <div style="font-size:12px;color:#1a1917;margin-top:4px;font-weight:500;">${label}</div>
        <div style="font-size:11px;color:#9c9189;margin-top:2px;">${note}</div>
      </div>
    </td>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Coldbase ${label} Digest</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body style="margin:0;padding:0;background:#f8f7f5;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7f5;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e8e6e1;max-width:580px;box-shadow:0 1px 2px rgba(0,0,0,0.05),0 2px 8px rgba(0,0,0,0.04);">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid #e8e6e1;">
              <div style="font-size:18px;font-weight:700;color:#b85212;letter-spacing:-0.01em;">Coldbase</div>
              <div style="font-size:13px;color:#78716c;margin-top:4px;font-weight:500;">Your ${label} Digest &middot; ${periodLabel}</div>
            </td>
          </tr>

          <!-- Stats -->
          <tr>
            <td style="padding:28px 32px 20px;">
              <p style="margin:0 0 18px;font-size:14px;color:#78716c;font-weight:500;">
                Here's your outreach summary:
              </p>
              <table cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;">
                <tr>${cardHtml}</tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:4px 32px 32px;">
              <a href="${dashboardUrl}"
                 style="display:inline-block;background:#b85212;color:#ffffff;font-size:13px;font-weight:600;padding:11px 22px;border-radius:8px;text-decoration:none;font-family:'Plus Jakarta Sans',-apple-system,sans-serif;">
                Open Coldbase →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #e8e6e1;padding:18px 32px;background:#f8f7f5;border-radius:0 0 12px 12px;">
              <p style="margin:0;font-size:12px;color:#9c9189;line-height:1.5;">
                You're receiving this because you enabled ${label.toLowerCase()} digests in your Coldbase settings.
                To unsubscribe, update your notification preferences in settings.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Plain-text fallback.
 */
export function buildDigestEmailText({ frequency, stats, dashboardUrl }) {
  const label = frequency === 'monthly' ? 'Monthly' : 'Weekly';
  const pct = (rate) => rate != null ? `${Math.round(rate * 100)}%` : 'N/A';

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - stats.windowDays);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return [
    `Your Coldbase ${label} Digest — ${fmt(windowStart)}–${fmt(now)}`,
    '',
    `Follow-ups due (all time):  ${stats.followUpsDue}`,
    `Total contacts (all time):  ${stats.totalContacts}`,
    `Emails sent (this period):  ${stats.emailsSent}`,
    `Send rate:                  ${pct(stats.sendRate)}`,
    ...(stats.replyRate != null ? [`Reply rate:                 ${pct(stats.replyRate)}`] : []),
    '',
    `Open Coldbase: ${dashboardUrl}`,
    '',
    `To unsubscribe, update your notification preferences in settings.`,
  ].join('\n');
}
