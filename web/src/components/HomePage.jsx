// web/src/components/HomePage.jsx
import { useState } from 'react';
import InsightsPanel from './InsightsPanel';

// ── Action card shell ──────────────────────────────────────────────────────

function ActionCard({ children, className = '' }) {
  return (
    <div className={`bg-chrome-surface border border-chrome-rim rounded-xl p-5 shadow-card ${className}`}>
      {children}
    </div>
  );
}

// ── Email notifications opt-in ─────────────────────────────────────────────

function NotificationsCard() {
  const [enabled, setEnabled] = useState(false);

  return (
    <ActionCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
            Email digests
          </p>
          <p className="text-[12px] text-chrome-muted leading-relaxed">
            Get a weekly summary of your outreach activity and reply rate delivered to your inbox.
          </p>
        </div>
        {/* Toggle */}
        <button
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? 'Disable email digests' : 'Enable email digests'}
          onClick={() => setEnabled(v => !v)}
          className={`
            relative flex-shrink-0 w-10 h-[22px] rounded-full border transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50
            ${enabled ? 'bg-accent border-accent' : 'bg-chrome-deep border-chrome-border'}
          `}
        >
          <span
            className={`
              absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
              ${enabled ? 'translate-x-[18px]' : 'translate-x-0'}
            `}
          />
        </button>
      </div>
    </ActionCard>
  );
}

// ── Complete your profile ──────────────────────────────────────────────────

function CompleteProfileCard() {
  return (
    <ActionCard>
      <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
        Complete your profile
      </p>
      <p className="text-[12px] text-chrome-muted leading-relaxed mb-4">
        Add your name and role so Reach can personalize your outreach suggestions.
      </p>
      <button
        type="button"
        className="text-[12px] font-semibold text-accent hover:text-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
      >
        Set up profile →
      </button>
    </ActionCard>
  );
}

// ── Reach Pro modal ────────────────────────────────────────────────────────

function ProModal({ onClose }) {
  const freeFeatures = [
    'Unlimited contact tracking',
    'Basic email templates',
    'Reply tracking',
    'Send-time insights (limited)',
    'CSV export',
  ];

  const proFeatures = [
    { title: 'Everything in Free', desc: null },
    { title: 'AI-drafted follow-up emails', desc: 'Generate personalised follow-ups in one click based on your prior conversation.' },
    { title: 'Advanced send-time analytics', desc: 'Full hourly breakdown once you hit the data threshold.' },
    { title: 'Advanced reporting', desc: 'Track reply rates and pipeline health over time.' },
    { title: 'Priority support', desc: null },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-chrome-surface rounded-2xl shadow-card-drag w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-5 text-chrome-muted hover:text-chrome-text text-lg leading-none transition-colors"
        >
          ✕
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <p className="font-display text-[19px] font-bold text-chrome-text leading-snug">
            Reach Pro users send smarter and get <span className="text-accent">more replies</span>.
          </p>
        </div>

        {/* Feature comparison */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-4">
          {/* Free */}
          <div className="bg-chrome-bg rounded-xl p-5">
            <p className="font-sans font-bold text-[14px] text-chrome-text mb-1">Free</p>
            <p className="text-[11px] text-chrome-muted mb-4 leading-relaxed">Everything you need to get started. Free forever.</p>
            <ul className="space-y-2.5">
              {freeFeatures.map(f => (
                <li key={f} className="flex items-start gap-2 text-[12px] text-chrome-text">
                  <span className="mt-px text-chrome-muted text-[13px]">○</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Pro */}
          <div className="bg-accent/[0.03] border border-accent/20 rounded-xl p-5">
            <p className="font-sans font-bold text-[14px] text-accent mb-1">Reach Pro</p>
            <p className="text-[11px] text-chrome-muted mb-4 leading-relaxed">The full suite, to help you close more opportunities.</p>
            <ul className="space-y-3">
              {proFeatures.map(f => (
                <li key={f.title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                    <span className="text-white text-[9px] leading-none">✓</span>
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-chrome-text">{f.title}</p>
                    {f.desc && <p className="text-[11px] text-chrome-muted leading-relaxed mt-0.5">{f.desc}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Pricing */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-4">
          {/* Monthly */}
          <div className="rounded-xl p-4 border border-chrome-border bg-chrome-bg">
            <p className="text-[11px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted mb-1">Monthly</p>
            <p className="font-display text-[26px] font-bold text-chrome-text leading-none mb-0.5">
              $19<span className="text-[13px] font-sans font-normal text-chrome-muted"> / mo</span>
            </p>
            <p className="text-[10px] text-chrome-muted">billed monthly</p>
          </div>

          {/* Annual */}
          <div className="rounded-xl p-4 border border-accent/40 bg-accent/[0.04] relative">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold font-sans uppercase tracking-[0.08em] bg-accent text-white px-2.5 py-0.5 rounded-full whitespace-nowrap">
              Save 21%
            </span>
            <p className="text-[11px] font-semibold font-sans uppercase tracking-[0.1em] text-accent mb-1">Annual</p>
            <p className="font-display text-[26px] font-bold text-chrome-text leading-none mb-0.5">
              $15<span className="text-[13px] font-sans font-normal text-chrome-muted"> / mo</span>
            </p>
            <p className="text-[10px] text-chrome-muted">billed $180 / yr</p>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-8">
          <button
            type="button"
            className="w-full py-3 bg-accent text-white font-semibold text-[14px] rounded-xl hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reach Pro pricing card ─────────────────────────────────────────────────

function UpgradeCard() {
  const [open, setOpen] = useState(false);

  const features = [
    'AI-drafted follow-up emails',
    'Advanced analytics & reporting',
    'Priority support',
  ];

  return (
    <>
      <ActionCard className="border-accent/20 bg-accent/[0.03]">
        <p className="font-sans font-semibold text-[15px] text-chrome-text mb-3">
          Reach Pro
        </p>
        <ul className="space-y-1 mb-4">
          {features.map(f => (
            <li key={f} className="flex items-center gap-2 text-[12px] text-chrome-muted">
              <span className="text-accent text-[10px]">✦</span>
              {f}
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          {/* Monthly */}
          <div className="flex flex-col items-center gap-2 border border-chrome-border rounded-xl p-3 flex-1">
            <p className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted">
              Monthly
            </p>
            <div className="text-center">
              <span className="font-display text-[22px] font-bold text-chrome-text">$19</span>
              <span className="text-[11px] text-chrome-muted"> / mo</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full text-[11px] font-semibold text-accent border border-accent/40 rounded-lg py-1.5 hover:bg-accent/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              Subscribe
            </button>
          </div>

          {/* Annual */}
          <div className="flex flex-col items-center gap-2 border border-accent/40 bg-accent/[0.04] rounded-xl p-3 flex-1 relative">
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold font-sans uppercase tracking-[0.08em] bg-accent text-white px-2 py-0.5 rounded-full whitespace-nowrap">
              Save 21%
            </span>
            <p className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted">
              Annual
            </p>
            <div className="text-center">
              <span className="font-display text-[22px] font-bold text-chrome-text">$15</span>
              <span className="text-[11px] text-chrome-muted"> / mo</span>
            </div>
            <p className="text-[9px] text-chrome-muted text-center">billed $180 / yr</p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="w-full text-[11px] font-semibold text-white bg-accent rounded-lg py-1.5 hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              Subscribe
            </button>
          </div>
        </div>
      </ActionCard>

      {open && <ProModal onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Developer note ─────────────────────────────────────────────────────────

function DeveloperNote() {
  return (
    <ActionCard>
      <p className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted mb-2">
        A note from the developer
      </p>
      <p className="text-[12px] text-chrome-subtle leading-relaxed">
        I built Reach because spreadsheet-based outreach tracking was eating my time. I wanted something minimal and honest. Pro keeps the lights on — thank you for being here.
      </p>
    </ActionCard>
  );
}

// ── Home page ──────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="flex-1 overflow-y-auto">
      {/* Insights section — full-width at top */}
      <div className="border-b border-chrome-border min-h-[280px]">
        <InsightsPanel />
      </div>

      {/* Action cards grid */}
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Left: utility cards stacked */}
          <div className="flex flex-col gap-4">
            <NotificationsCard />
            <CompleteProfileCard />
          </div>
          {/* Centre: pricing */}
          <UpgradeCard />
          {/* Right: developer note */}
          <DeveloperNote />
        </div>
      </div>
    </div>
  );
}
