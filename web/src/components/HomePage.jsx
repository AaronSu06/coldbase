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

// ── Reach Pro pricing card ─────────────────────────────────────────────────

function UpgradeCard() {
  const features = [
    'AI-drafted follow-up emails',
    'Advanced analytics & reporting',
    'Priority support',
  ];

  return (
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
            className="w-full text-[11px] font-semibold text-white bg-accent rounded-lg py-1.5 hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
          >
            Subscribe
          </button>
        </div>
      </div>
    </ActionCard>
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
