// server/emails/digestTemplate.js

/**
 * @param {object} opts
 * @param {string} opts.frequency  - 'weekly' | 'monthly'
 * @param {object} opts.stats
 * @param {number} opts.stats.totalContacts
 * @param {number} opts.stats.followUpsDue
 * @param {number} opts.stats.emailsSent
 * @param {number} opts.stats.sendRate    - 0–1
 * @param {number|null} opts.stats.replyRate  - 0–1, or null if no emails sent
 * @param {string} opts.dashboardUrl
 * @returns {string} HTML string
 */
export function buildDigestEmail({ frequency, stats, dashboardUrl }) {
  const label = frequency === 'monthly' ? 'Monthly' : 'Weekly';
  const pct = (rate) => rate != null ? `${Math.round(rate * 100)}%` : '—';

  const statCards = [
    { label: 'Follow-ups due', value: stats.followUpsDue },
    { label: 'Total contacts', value: stats.totalContacts },
    { label: 'Emails sent',    value: stats.emailsSent },
    { label: 'Send rate',      value: pct(stats.sendRate) },
    ...(stats.replyRate != null
      ? [{ label: 'Reply rate', value: pct(stats.replyRate) }]
      : []),
  ];

  const cardHtml = statCards.map(({ label, value }) => `
    <td style="padding:0 8px 0 0;vertical-align:top;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;min-width:100px;">
        <div style="font-size:22px;font-weight:700;color:#111827;line-height:1;">${value}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${label}</div>
      </div>
    </td>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your Coldbase ${label} Digest</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:28px 32px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;">Coldbase</div>
              <div style="font-size:13px;color:#9ca3af;margin-top:4px;">Your ${label} Digest</div>
            </td>
          </tr>

          <!-- Stats -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 20px;font-size:15px;color:#374151;">
                Here's your outreach summary:
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>${cardHtml}</tr>
              </table>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:0 32px 36px;">
              <a href="${dashboardUrl}"
                 style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
                Open Coldbase →
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #f3f4f6;padding:20px 32px;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
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
 * Plain-text fallback for email clients that don't render HTML.
 */
export function buildDigestEmailText({ frequency, stats, dashboardUrl }) {
  const label = frequency === 'monthly' ? 'Monthly' : 'Weekly';
  const pct = (rate) => rate != null ? `${Math.round(rate * 100)}%` : 'N/A';
  return [
    `Your Coldbase ${label} Digest`,
    '',
    `Follow-ups due:  ${stats.followUpsDue}`,
    `Total contacts:  ${stats.totalContacts}`,
    `Emails sent:     ${stats.emailsSent}`,
    `Send rate:       ${pct(stats.sendRate)}`,
    ...(stats.replyRate != null ? [`Reply rate:      ${pct(stats.replyRate)}`] : []),
    '',
    `Open Coldbase: ${dashboardUrl}`,
    '',
    `To unsubscribe, update your notification preferences in settings.`,
  ].join('\n');
}
