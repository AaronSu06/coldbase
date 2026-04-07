// web/src/components/LegalModal.jsx
import { useState } from 'react';
import { Section } from './LegalShell';

function TermsContent() {
  return (
    <>
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
    </>
  );
}

function PrivacyContent() {
  return (
    <>
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
        <p>If you use AI drafting or feedback features, your email content is sent to a third-party AI service to generate a response. It is not stored by us after the response is returned.</p>
        <p>If you use the email finder feature, your search query is sent to a third-party contact lookup service. That service's own privacy policy applies to that request.</p>
      </Section>

      <Section title="Third-party services">
        <p>Coldbase uses the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>Google OAuth &amp; Gmail API</strong> — to authenticate your account and read Gmail threads (readonly access only)</li>
          <li><strong>Stripe</strong> — to process Pro subscription payments</li>
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
    </>
  );
}

const TITLES = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

export default function LegalModal({ doc, onClose }) {
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => onClose(), 180);
  }

  return (
    <div
      className={`overlay-backdrop fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/40 sm:p-4${isClosing ? ' closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`pro-modal-panel relative bg-chrome-surface w-full sm:max-w-xl rounded-t-2xl sm:rounded-xl shadow-card-drag max-h-[85vh] flex flex-col${isClosing ? ' closing' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-chrome-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-chrome-border flex-shrink-0">
          <h2 className="font-display font-bold text-[17px] text-chrome-text">{TITLES[doc]}</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center text-chrome-muted hover:text-chrome-text transition-colors rounded-full hover:bg-chrome-bg"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="13" y2="13" />
              <line x1="13" y1="1" x2="1" y2="13" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-6">
          <div className="font-sans text-[14px] text-chrome-text leading-relaxed space-y-8">
            {doc === 'terms' ? <TermsContent /> : <PrivacyContent />}
          </div>
        </div>
      </div>
    </div>
  );
}
