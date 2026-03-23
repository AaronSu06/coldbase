// web/src/components/HomePage.jsx
import { useState } from 'react'; // used by UpgradeCard
import InsightsPanel from './InsightsPanel';

// ── Action card shell ──────────────────────────────────────────────────────

function ActionCard({ children, className = '' }) {
  return (
    <div className={`bg-chrome-surface border border-chrome-rim rounded-xl p-5 ${className}`}>
      {children}
    </div>
  );
}

// ── Follow-up nudge ────────────────────────────────────────────────────────

function FollowUpCard({ count, onGoToTracker }) {
  if (count === 0) {
    return (
      <ActionCard>
        <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
          You're all caught up
        </p>
        <p className="text-[12px] text-chrome-muted leading-relaxed">
          No follow-ups overdue. Keep the momentum going.
        </p>
      </ActionCard>
    );
  }

  return (
    <ActionCard>
      <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
        <span className="font-mono text-accent">{count}</span>{' '}
        {count === 1 ? 'contact' : 'contacts'} to follow up with
      </p>
      <p className="text-[12px] text-chrome-muted leading-relaxed mb-3">
        {count === 1 ? "Hasn't" : "Haven't"} replied in 7+ days — worth a nudge.
      </p>
      <button
        type="button"
        onClick={onGoToTracker}
        className="text-[12px] font-semibold text-accent hover:text-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
      >
        Go to Job Tracker →
      </button>
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
        <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-6 text-center">
          <p className="font-display text-[19px] font-bold text-chrome-text leading-snug">
            Reach Pro users send smarter and get <span className="text-accent">more replies</span>.
          </p>
        </div>

        {/* Feature comparison */}
        <div className="px-4 sm:px-6 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <div className="px-4 sm:px-6 pb-6 grid grid-cols-2 gap-4">
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
    'Advanced send-time insights',
  ];

  return (
    <>
      <ActionCard className="border-accent/20 bg-accent/[0.03] flex flex-col">
        <div className="mb-3">
          <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
            Reach Pro
          </p>
          <p className="text-[12px] text-chrome-muted leading-relaxed">
            AI-powered follow-ups, deep analytics, and priority support — for serious outreach.
          </p>
        </div>

        <div className="border-t border-chrome-border -mx-5 mb-4" />

        <ul className="space-y-2 mb-4 flex-1">
          {features.map(f => (
            <li key={f} className="flex items-center gap-2 text-[12px] text-chrome-muted">
              <span className="text-accent text-[10px]">✦</span>
              {f}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full py-2 bg-accent text-white font-semibold text-[12px] rounded-lg hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
        >
          Subscribe to Reach Pro
        </button>
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

export default function HomePage({ insightsDateFrom, insightsDateTo, insightsData, insightsLoading, insightsError, onInsightsRangeChange, followUpCount = 0, onGoToTracker }) {
  return (
    <div className="h-full overflow-y-auto">
      {/* Insights section — full-width at top */}
      <div className="border-b border-chrome-border min-h-[280px]">
        <InsightsPanel
          dateFrom={insightsDateFrom}
          dateTo={insightsDateTo}
          data={insightsData}
          loading={insightsLoading}
          error={insightsError}
          onRangeChange={onInsightsRangeChange}
        />
      </div>

      {/* Action cards grid */}
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-chrome-muted mb-4">
          Your account
        </p>
        {/*
          Mobile order: Pro first (above fold), then utility cards, then note.
          Desktop order: utility | Pro | note  (via sm:order-* overrides).
        */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Pro — mobile: first, desktop: center */}
          <div className="order-1 sm:order-2">
            <UpgradeCard />
          </div>
          {/* Utility cards — mobile: second, desktop: left */}
          <div className="order-2 sm:order-1 flex flex-col gap-4">
            <FollowUpCard count={followUpCount} onGoToTracker={onGoToTracker} />
            <CompleteProfileCard />
          </div>
          {/* Developer note — mobile: third, desktop: right */}
          <div className="order-3 sm:order-3">
            <DeveloperNote />
          </div>
        </div>
      </div>
    </div>
  );
}
