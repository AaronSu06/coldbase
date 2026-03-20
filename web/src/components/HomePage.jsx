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

// ── Upgrade teaser ─────────────────────────────────────────────────────────

function UpgradeCard() {
  return (
    <ActionCard className="border-accent/20 bg-accent/[0.03]">
      <div className="flex items-center gap-2 mb-0.5">
            <p className="font-sans font-semibold text-[14px] text-chrome-text">
              Reach Pro
            </p>
            <span className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-accent/70 bg-accent/10 px-1.5 py-0.5 rounded-md">
              Coming soon
            </span>
          </div>
      <p className="text-[12px] text-chrome-muted leading-relaxed mt-0.5">
        Unlock AI-drafted follow-ups, advanced analytics, and priority support.
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
      <div className="p-4 sm:p-8 max-w-4xl space-y-4">
        {/* Top row: utility cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <NotificationsCard />
          <CompleteProfileCard />
        </div>
        {/* Bottom row: subscription */}
        <UpgradeCard />
      </div>
    </div>
  );
}
