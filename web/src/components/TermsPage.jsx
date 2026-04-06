// web/src/components/TermsPage.jsx
import LegalShell, { Section } from './LegalShell';

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service">

      <p className="text-chrome-muted">
        By using Coldbase, you agree to these terms. Please read them.
      </p>

      <Section title="What Coldbase is">
        <p>Coldbase is a Gmail extension and web dashboard for tracking cold outreach emails. It helps you manage your pipeline, draft follow-ups, and find contact information.</p>
      </Section>

      <Section title="Acceptable use">
        <p>Coldbase is for personal outreach tracking only. You may not use Coldbase to send unsolicited bulk email, spam, or to violate any applicable laws or Gmail's terms of service.</p>
        <p>We reserve the right to suspend accounts that abuse the service.</p>
      </Section>

      <Section title="Pro subscription">
        <p>Coldbase Pro is available for $7/month (billed monthly) or $60/year (billed annually). Payments are processed by Stripe.</p>
        <p>You can cancel your subscription at any time from your account settings. Cancellation takes effect at the end of your current billing period. We do not offer refunds for partial billing periods.</p>
      </Section>

      <Section title="No warranty">
        <p>Coldbase is provided as-is. We make no guarantees about uptime, data accuracy, or fitness for any particular purpose. We are not liable for lost data, missed outreach, or any other damages arising from your use of the service.</p>
      </Section>

      <Section title="Changes to these terms">
        <p>We may update these terms from time to time. If we make material changes, we will notify you by email. Continued use of Coldbase after changes take effect means you accept the updated terms.</p>
      </Section>

      <Section title="Contact">
        <p>Questions? Email us at <a href="mailto:coldbaseapp@gmail.com" className="text-accent hover:text-accent-hover">coldbaseapp@gmail.com</a>.</p>
      </Section>

    </LegalShell>
  );
}
