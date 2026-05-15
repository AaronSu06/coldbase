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
    <div className="bg-chrome-surface border border-chrome-rim rounded-lg p-5 flex flex-col">
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
            <ul>
              {records.map((r, idx) => (
                <li key={r.threadId}>
                  {idx > 0 && <div className="border-t border-chrome-border mx-5" />}
                  <div className="flex items-center justify-between gap-3 px-5 py-2.5">
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
                  </div>
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
    '10x more email finding',
    'AI-drafted follow-up emails',
    'Personalised AI feedback',
  ];

  return (
    <ActionCard className="border-accent/20 bg-accent/[0.03] flex flex-col flex-1">
      <div className="mb-3">
        <p className="font-sans font-semibold text-[14px] text-chrome-text mb-0.5">
          Coldbase Pro
        </p>
        <p className="text-[12px] text-chrome-muted leading-relaxed">
          More email finding, AI drafting, and personalised feedback.
        </p>
      </div>

      <div className="border-t border-chrome-border mx-5 mb-4" />

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
    <ActionCard>
      <p className="text-[10px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted mb-2">
        A note from the developer
      </p>
      <p className="text-[12px] text-chrome-subtle leading-relaxed">
        Coldbase started as a small local project I built for myself. Initially, I kept losing track of who I'd reached out to, missing the right moment to follow up, and had no single place to manage everything. After building and using Coldbase for a while, I thought: why not see if it could be useful to other students too?
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
      {/* Mobile: natural scroll. Desktop: no scroll, fill viewport exactly */}
      <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden sm:flex sm:flex-col">
        <div className="px-4 sm:px-6 py-4 sm:py-6 flex flex-col flex-1 min-h-0">
          <div className="max-w-5xl w-full mx-auto flex flex-col flex-1 min-h-0 gap-4">

            {/* 2-col: stacked on mobile, side-by-side on desktop, fills available height */}
            <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">

              {/* Left (2/3): InsightsPanel */}
              <div className="sm:flex-[2] bg-chrome-surface border border-chrome-rim rounded-lg overflow-hidden">
                <InsightsPanel
                  dateFrom={insightsDateFrom}
                  dateTo={insightsDateTo}
                  data={insightsData}
                  loading={insightsLoading}
                  error={insightsError}
                  onRangeChange={onInsightsRangeChange}
                />
              </div>

              {/* Right (1/3): stacked action cards, scrollable if they exceed column height */}
              <div className="sm:flex-[1] flex flex-col gap-4 sm:overflow-y-auto">
                <UpgradeCard onOpenProModal={onOpenProModal} />
                <FollowUpCard records={followUps} onGoToTracker={onGoToTracker} onSelectRecord={onSelectRecord} />
                {resumeName !== undefined && (
                  <CompleteProfileCard
                    hasResume={!!resumeName}
                    onSetupProfile={() => navigate(resumeName ? '/settings' : '/settings?scrollTo=resume')}
                  />
                )}
              </div>
            </div>

            {/* Developer note — inline footer */}
            <p className="flex-shrink-0 text-[11px] text-chrome-subtle leading-relaxed pb-2">
              <span className="font-semibold font-sans uppercase tracking-[0.08em] text-[9px] text-chrome-muted">Note · </span>
              Coldbase started as a small local project I built for myself. Initially, I kept losing track of who I'd reached out to, missing the right moment to follow up, and had no single place to manage everything. After building and using Coldbase for a while, I thought, <em>why not see if it could be useful to other students too?</em>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}
