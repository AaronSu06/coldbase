# Legal Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add publicly accessible Privacy Policy and Terms of Service pages to the Coldbase web app, linked from signup/login and usable as the Chrome Web Store privacy policy URL.

**Architecture:** Two new page components (`PrivacyPage.jsx`, `TermsPage.jsx`) share a `LegalShell.jsx` layout. Both routes are public (no auth guard) in `main.jsx`. The signup page gains a ToS consent line below the submit button.

**Tech Stack:** React, React Router v6, Tailwind CSS with custom `chrome-*` tokens, existing design system.

---

### Task 1: Create LegalShell.jsx

**Files:**
- Create: `web/src/components/LegalShell.jsx`

The shell provides a centered, scrollable layout for legal prose. It shows the Coldbase logo/wordmark at the top and a "Back to app" link. No auth required — these pages must be publicly accessible.

**Step 1: Create the file**

```jsx
// web/src/components/LegalShell.jsx
import { Link } from 'react-router-dom';

export default function LegalShell({ title, children }) {
  return (
    <div className="min-h-screen bg-chrome-bg px-6 py-12">
      <div className="max-w-2xl mx-auto">

        {/* Logo + wordmark */}
        <div className="flex items-center gap-2.5 mb-10">
          <img src="/logo.png" alt="" className="w-7 h-7 flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className="font-display text-2xl font-bold text-chrome-text leading-none tracking-tight">
            Coldbase
          </span>
        </div>

        {/* Page title */}
        <h1 className="font-display text-3xl font-bold text-chrome-text mb-2">{title}</h1>
        <p className="text-[13px] text-chrome-muted mb-10">Last updated: April 6, 2026</p>

        {/* Content */}
        <div className="font-sans text-[14px] text-chrome-text leading-relaxed space-y-8">
          {children}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-chrome-border">
          <Link
            to="/auth/login"
            className="text-[13px] text-accent hover:text-accent-hover transition-colors"
          >
            ← Back to Coldbase
          </Link>
        </div>

      </div>
    </div>
  );
}
```

**Step 2: Verify the file saved correctly**

Run: `cat web/src/components/LegalShell.jsx | head -5`
Expected: First line is `// web/src/components/LegalShell.jsx`

**Step 3: Commit**

```bash
git add web/src/components/LegalShell.jsx
git commit -m "feat: add LegalShell layout for privacy/terms pages"
```

---

### Task 2: Create PrivacyPage.jsx

**Files:**
- Create: `web/src/components/PrivacyPage.jsx`

Write the full privacy policy. Coldbase collects: account email, Gmail thread metadata (never full email bodies), email open tracking pixels, and payment info via Stripe. Third-party services: Stripe, Hunter.io, Google Gemini, Neon, Google OAuth.

**Step 1: Create the file**

```jsx
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

      <Section title="How we use your data">
        <p>Your outreach records are used to power the Coldbase tracker and dashboard — nothing else.</p>
        <p>If you use AI drafting or feedback features, your email content is sent to Google Gemini to generate a response. It is not stored by us after the response is returned.</p>
        <p>If you use the email finder feature, your search query is sent to Hunter.io to look up contact information. Hunter.io's own privacy policy applies to that request.</p>
      </Section>

      <Section title="Third-party services">
        <p>Coldbase uses the following third-party services:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2">
          <li><strong>Google OAuth & Gmail API</strong> — to authenticate your account and read Gmail threads (readonly access only)</li>
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
```

**Step 2: Commit**

```bash
git add web/src/components/PrivacyPage.jsx
git commit -m "feat: add PrivacyPage component"
```

---

### Task 3: Create TermsPage.jsx

**Files:**
- Create: `web/src/components/TermsPage.jsx`

**Step 1: Create the file**

```jsx
// web/src/components/TermsPage.jsx
import LegalShell from './LegalShell';

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display font-bold text-[18px] text-chrome-text mb-3">{title}</h2>
      <div className="text-chrome-muted space-y-3">{children}</div>
    </section>
  );
}

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
```

**Step 2: Commit**

```bash
git add web/src/components/TermsPage.jsx
git commit -m "feat: add TermsPage component"
```

---

### Task 4: Wire public routes in main.jsx

**Files:**
- Modify: `web/src/main.jsx`

Add two public (no `PrivateRoute` guard) routes before the catch-all. Import both new page components.

**Step 1: Add imports at the top of main.jsx**

After the existing imports, add:
```jsx
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
```

**Step 2: Add routes inside `<Routes>`, before the `/*` catch-all**

```jsx
<Route path="/legal/privacy" element={<PrivacyPage />} />
<Route path="/legal/terms" element={<TermsPage />} />
```

**Step 3: Verify the dev server loads the pages**

Run the dev server (`npm run dev` in `web/`) and visit:
- `http://localhost:5173/legal/privacy` — should show Privacy Policy
- `http://localhost:5173/legal/terms` — should show Terms of Service

Both should be accessible without logging in.

**Step 4: Commit**

```bash
git add web/src/main.jsx
git commit -m "feat: add public /legal/privacy and /legal/terms routes"
```

---

### Task 5: Add consent line to SignupPage and LoginPage

**Files:**
- Modify: `web/src/components/SignupPage.jsx:160` (after the submit button, before the "Already have an account?" line)
- Modify: `web/src/components/LoginPage.jsx:139` (same position)

**Step 1: Add to SignupPage.jsx**

Find the closing `</form>` tag (after the submit button) and add immediately after it:

```jsx
      {/* Legal consent */}
      <p className="mt-3 text-[11px] font-sans text-chrome-subtle text-center leading-relaxed">
        By creating an account, you agree to our{' '}
        <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">
          Terms of Service
        </a>
        {' '}and{' '}
        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">
          Privacy Policy
        </a>.
      </p>
```

**Step 2: Add to LoginPage.jsx**

Find the closing `</form>` tag and add the same block immediately after it, but with "By signing in" instead:

```jsx
      {/* Legal consent */}
      <p className="mt-3 text-[11px] font-sans text-chrome-subtle text-center leading-relaxed">
        By signing in, you agree to our{' '}
        <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">
          Terms of Service
        </a>
        {' '}and{' '}
        <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">
          Privacy Policy
        </a>.
      </p>
```

**Step 3: Verify visually**

Visit `http://localhost:5173/auth/register` and `http://localhost:5173/auth/login`. Both should show the consent line below the submit button. Clicking the links should open the legal pages in a new tab without requiring login.

**Step 4: Commit**

```bash
git add web/src/components/SignupPage.jsx web/src/components/LoginPage.jsx
git commit -m "feat: add ToS and privacy consent line to signup and login pages"
```

---

### Task 6: Push to main

```bash
git push origin main
```

Verify in production that:
- `/legal/privacy` loads without login
- `/legal/terms` loads without login
- The consent links on signup/login open in a new tab correctly

These URLs are now ready to submit to the Chrome Web Store privacy policy field.
