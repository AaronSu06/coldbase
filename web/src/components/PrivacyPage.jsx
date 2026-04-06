// web/src/components/PrivacyPage.jsx
import LegalShell from './LegalShell';

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display font-bold text-[18px] text-chrome-text mb-3">{title}</h2>
      <div className="text-chrome-muted space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">

      <p className="text-chrome-muted">
        Coldbase is a Gmail extension and dashboard that helps you track cold outreach.
        This policy explains what data we collect, how we use it, and your rights.
      </p>

      <Section title="What we collect">
        <p>When you create an account, we collect your email address and a hashed password. We never store your password in plain text.</p>
        <p>When you use the Coldbase extension, we read your Gmail threads to detect cold outreach emails. From each thread we store: the company name, contact name, email subject line, thread ID, sent date, message count, and whether you received a reply. <strong>We do not store full email bodies on our servers.</strong></p>
        <p>The extension injects a small invisible tracking pixel into emails you send through our compose tool. This tells us when a recipient opens your email. This only applies to emails sent using the Coldbase compose feature.</p>
        <p>If you subscribe to Coldbase Pro, payment is processed by Stripe. We do not store your card number — Stripe handles all payment data.</p>
      </Section>

      <Section title="Cookies and local storage">
        <p>Coldbase stores your login token in your browser's local storage to keep you signed in. This token expires when you log out. We do not use third-party tracking cookies.</p>
      </Section>

      <Section title="How we use your data">
        <p>Your outreach records are used to power the Coldbase tracker and dashboard — nothing else.</p>
        <p>If you use AI drafting or feedback features, your email content is sent to Google Gemini to generate a response. It is not stored by us after the response is returned.</p>
        <p>If you use the email finder feature, your search query is sent to Hunter.io to look up contact information. Hunter.io's own privacy policy applies to that request.</p>
      </Section>

      <Section title="Third-party services">
        <p>Coldbase uses the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>Google OAuth &amp; Gmail API</strong> — to authenticate your account and read Gmail threads (readonly access only)</li>
          <li><strong>Google Gemini</strong> — to power AI email drafting and feedback</li>
          <li><strong>Hunter.io</strong> — to find contact email addresses</li>
          <li><strong>Stripe</strong> — to process Pro subscription payments</li>
          <li><strong>Neon</strong> — our database provider, hosted on AWS in the US</li>
        </ul>
      </Section>

      <Section title="Data retention">
        <p>We keep your data for as long as your account is active. If you delete your account, your outreach records and account information are permanently deleted from our database.</p>
        <p>To request account deletion, email us at <a href="mailto:coldbaseapp@gmail.com" className="text-accent hover:text-accent-hover">coldbaseapp@gmail.com</a>.</p>
      </Section>

      <Section title="Your rights">
        <p>You can export all your outreach data as a CSV at any time from the Coldbase dashboard. You can request deletion of your account and all associated data by emailing us.</p>
      </Section>

      <Section title="Contact">
        <p>Questions about this policy? Email us at <a href="mailto:coldbaseapp@gmail.com" className="text-accent hover:text-accent-hover">coldbaseapp@gmail.com</a>.</p>
      </Section>

    </LegalShell>
  );
}
