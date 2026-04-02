// web/src/components/HomePage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import InsightsPanel from './InsightsPanel';
import { fetchProfile } from '../lib/api';

// ── Action card shell ──────────────────────────────────────────────────────

function ActionCard({ children, className = '' }) {
  return (
    <div className={`bg-chrome-surface border border-chrome-rim rounded-lg p-5 ${className}`}>
      {children}
    </div>
  );
}

// ── Follow-up nudge ────────────────────────────────────────────────────────

function daysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
}

function daysAgoColor(days) {
  if (days >= 5) return 'text-red-500';
  if (days >= 3) return 'text-amber-600';
  return 'text-chrome-subtle';
}

function daysAgoLabel(days) {
  return days >= 5 ? '5+d ago' : `${days}d ago`;
}

function FollowUpCard({ records = [], onGoToTracker, onSelectRecord }) {
  const count = records.length;

  return (
    <div className="bg-chrome-surface border border-chrome-rim rounded-lg p-5 h-full flex flex-col">
      <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
        {count === 0
          ? "You're all caught up"
          : <><span className="font-mono text-accent">{count}</span>{' '}{count === 1 ? 'contact' : 'contacts'} to follow up with</>
        }
      </p>
      <p className="text-[12px] text-chrome-muted leading-relaxed mb-3">
        {count === 0
          ? 'No follow-ups overdue. Keep the momentum going.'
          : `${count === 1 ? "Hasn't" : "Haven't"} replied in 3+ days — worth a nudge.`
        }
      </p>

      {count > 0 && (
        <>
          <div className="flex-1 overflow-y-auto -mx-5 min-h-0">
            <ul className="divide-y divide-chrome-border">
              {records.map(r => (
                <li key={r.threadId} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onSelectRecord?.(r)}
                      className="group flex items-center gap-0.5 text-[13px] font-medium text-chrome-text hover:text-accent transition-colors text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 max-w-full"
                    >
                      <span className="truncate">{r.company}</span>
                      <ArrowUpRight size={11} className="flex-shrink-0 text-chrome-muted group-hover:text-accent transition-colors" />
                    </button>
                    {r.contactName && (
                      <p className="text-[11px] text-chrome-muted truncate">{r.contactName}</p>
                    )}
                  </div>
                  <span className={`font-mono text-[11px] flex-shrink-0 ${daysAgoColor(daysAgo(r.sentDate))}`}>
                    {daysAgoLabel(daysAgo(r.sentDate))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-3 border-t border-chrome-border mt-3">
            <button
              type="button"
              onClick={onGoToTracker}
              className="text-[12px] font-semibold text-accent hover:text-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              Go to Tracker
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Complete your profile ──────────────────────────────────────────────────

function CompleteProfileCard({ hasResume, onSetupProfile }) {
  if (hasResume) {
    return (
      <ActionCard>
        <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
          You're all set!
        </p>
        <p className="text-[12px] text-chrome-muted leading-relaxed mb-4">
          Your resume is uploaded and notifications are configured.
        </p>
        <button
          type="button"
          onClick={onSetupProfile}
          className="text-[12px] font-semibold text-accent hover:text-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
        >
          Check out your profile
        </button>
      </ActionCard>
    );
  }

  return (
    <ActionCard>
      <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
        Complete your profile
      </p>
      <p className="text-[12px] text-chrome-muted leading-relaxed mb-4">
        Upload a resume and set up email updates so Coldbase can personalise your outreach.
      </p>
      <button
        type="button"
        onClick={onSetupProfile}
        className="text-[12px] font-semibold text-accent hover:text-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
      >
        Set up profile
      </button>
    </ActionCard>
  );
}

// ProModal is imported from ProModal.jsx

// ── Coldbase Pro pricing card ─────────────────────────────────────────────────

function UpgradeCard({ onOpenProModal }) {
  const features = [
    'AI-drafted follow-up emails',
    'Advanced analytics & reporting',
    'Priority support',
    'Advanced send-time insights',
  ];

  return (
    <ActionCard className="border-accent/20 bg-accent/[0.03] flex flex-col h-full">
      <div className="mb-3">
        <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
          Coldbase Pro
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
        onClick={onOpenProModal}
        className="w-full py-2 bg-accent text-white font-semibold text-[12px] rounded-lg hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
      >
        Subscribe to Coldbase Pro
      </button>
    </ActionCard>
  );
}

// ── Developer note ─────────────────────────────────────────────────────────

function DeveloperNote() {
  return (
    <ActionCard className="flex-1">
      <p className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted mb-2">
        A note from the developer
      </p>
      <p className="text-[12px] text-chrome-subtle leading-relaxed">
        I built Coldbase because spreadsheet-based outreach tracking was eating my time. I wanted something minimal and honest. Pro keeps the lights on — thank you for being here.
      </p>
    </ActionCard>
  );
}

// ── Home page ──────────────────────────────────────────────────────────────

export default function HomePage({ insightsDateFrom, insightsDateTo, insightsData, insightsLoading, insightsError, onInsightsRangeChange, followUps = [], onGoToTracker, onSelectRecord, onOpenProModal }) {
  const navigate = useNavigate();
  const [resumeName, setResumeName] = useState(undefined);

  useEffect(() => {
    fetchProfile()
      .then(data => setResumeName(data.resumeName ?? null))
      .catch(e => { console.error('[Coldbase] Failed to load profile:', e.message); setResumeName(null); });
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Insights — natural height, does not scroll */}
      <div className="border-b border-chrome-border flex-shrink-0">
        <InsightsPanel
          dateFrom={insightsDateFrom}
          dateTo={insightsDateTo}
          data={insightsData}
          loading={insightsLoading}
          error={insightsError}
          onRangeChange={onInsightsRangeChange}
        />
      </div>

      {/* Cards — fills remaining viewport height */}
      <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden p-4 sm:p-6">
        <div className="max-w-5xl mx-auto sm:h-full sm:flex sm:flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-chrome-muted mb-3 flex-shrink-0">
            Your account
          </p>
          {/*
            Mobile: natural-height stacked cards, scrollable.
            Desktop: single-row grid that fills remaining height — all columns equal.
          */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:flex-1 sm:min-h-0">
            {/* Follow-up — fills full column height, list scrolls internally */}
            <div className="order-2 sm:order-1 sm:h-full">
              <FollowUpCard records={followUps} onGoToTracker={onGoToTracker} onSelectRecord={onSelectRecord} />
            </div>
            {/* Pro — mobile: first, desktop: center */}
            <div className="order-1 sm:order-2 sm:h-full">
              <UpgradeCard onOpenProModal={onOpenProModal} />
            </div>
            {/* Profile + note — stacked right column */}
            <div className="order-3 sm:order-3 flex flex-col gap-4 sm:h-full">
              {resumeName !== undefined && (
                <CompleteProfileCard
                  hasResume={!!resumeName}
                  onSetupProfile={() => navigate(resumeName ? '/settings' : '/settings?scrollTo=resume')}
                />
              )}
              <DeveloperNote />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
