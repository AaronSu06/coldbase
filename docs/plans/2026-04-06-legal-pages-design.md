# Design: Privacy Policy & Terms of Service Pages

**Date:** 2026-04-06
**Status:** Approved

## Problem

Coldbase needs publicly accessible Privacy Policy and Terms of Service pages. These are required by:
- Chrome Web Store (mandatory for extensions accessing Gmail)
- General best practice for any paid SaaS product

## Approach

Add two public routes to the existing web app. No separate marketing site needed.

## Routes

| Path | Component | Auth required |
|---|---|---|
| `/legal/privacy` | `PrivacyPage.jsx` | No |
| `/legal/terms` | `TermsPage.jsx` | No |

## New Files

- `web/src/components/LegalShell.jsx` — shared layout (logo, scrollable prose, back link)
- `web/src/components/PrivacyPage.jsx` — privacy policy content
- `web/src/components/TermsPage.jsx` — terms of service content

## Modified Files

- `web/src/main.jsx` — add two public `<Route>` entries
- `web/src/components/SignupPage.jsx` — add ToS consent line below submit button
- `web/src/components/LoginPage.jsx` — add same consent line for consistency

## Privacy Policy Content

Sections:
1. What we collect — account email, Gmail thread metadata (company, contact name, subject, sent date, reply status, thread ID), email open tracking pixels, Stripe payment info
2. What we don't store — full email bodies are never persisted server-side
3. How we use it — powering the outreach tracker, AI drafting/feedback (Gemini API), email finding (Hunter.io), billing (Stripe)
4. Third-party services — Stripe, Hunter.io, Google Gemini, Neon (database), Google OAuth
5. Data retention — data kept until account deletion; contact coldbaseapp@gmail.com to request deletion
6. Contact — coldbaseapp@gmail.com

## Terms of Service Content

Sections:
1. What Coldbase is — a Gmail extension + dashboard for tracking cold outreach
2. Acceptable use — personal outreach tracking only; no spam, no bulk unsolicited email
3. Pro subscription — $7/mo (monthly) or $60/yr (annual); billed via Stripe; cancel anytime; no refunds for partial periods
4. No warranty — provided as-is; we are not liable for data loss or missed outreach
5. Changes to terms — we may update these; continued use = acceptance
6. Contact — coldbaseapp@gmail.com

## Design System

- Uses existing `chrome-*` Tailwind tokens (no new CSS)
- `font-display` for headings, `font-sans` for body
- `text-accent` for links
- `bg-chrome-bg` page background, `bg-chrome-surface` content card

## Consent Line (Signup + Login)

```
By creating an account, you agree to our Terms of Service and Privacy Policy.
```

Small `text-chrome-muted` text, links in `text-accent`, placed below the submit button.
