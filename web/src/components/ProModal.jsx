// web/src/components/ProModal.jsx
import { useState } from 'react';
import { createCheckoutSession } from '../lib/api';

const freeFeatures = [
  'Unlimited contact tracking',
  'Basic email templates',
  'Reply tracking',
  'Send-time insights',
  'CSV export',
];

const proFeatures = [
  { title: 'Everything in Free', desc: null },
  { title: '10x more email finding', desc: '50 contact lookups per month, vs 5 on the free plan.' },
  { title: 'AI-drafted follow-up emails', desc: 'Generate personalised follow-ups in one click based on your prior conversation.' },
  { title: 'Personalised AI feedback', desc: 'Get actionable feedback on your emails before you send them.' },
];

export default function ProModal({ onClose }) {
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => onClose(), 180);
  }

  async function handleGetStarted() {
    setLoading(true);
    try {
      const { url } = await createCheckoutSession(selectedPlan);
      window.location.href = url;
    } catch (e) {
      console.error('[Coldbase] Checkout failed:', e.message);
      setLoading(false);
    }
  }

  return (
    <div
      className={`overlay-backdrop fixed inset-0 z-50 flex sm:items-center sm:justify-center items-end bg-black/40 sm:p-4${isClosing ? ' closing' : ''}`}
      onClick={handleClose}
    >
      <div
        className={`pro-modal-panel relative bg-chrome-surface w-full sm:max-w-2xl rounded-t-2xl sm:rounded-xl shadow-card-drag max-h-[90vh] overflow-y-auto${isClosing ? ' closing' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-chrome-border" />
        </div>

        {/* Close button — desktop only */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="hidden sm:flex absolute top-4 right-5 w-9 h-9 items-center justify-center text-chrome-muted hover:text-chrome-text transition-colors rounded-full hover:bg-chrome-bg"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="13" y2="13" />
            <line x1="13" y1="1" x2="1" y2="13" />
          </svg>
        </button>

        {/* Header */}
        <div className="px-6 sm:px-8 pt-5 sm:pt-8 pb-5 sm:pb-6 sm:pr-12 text-center">
          <p className="font-display text-[17px] sm:text-[19px] font-bold text-chrome-text leading-snug">
            Coldbase Pro users send smarter and get <span className="text-accent">more replies</span>.
          </p>
        </div>

        {/* Feature comparison */}
        <div className="px-4 sm:px-6 pb-5 sm:pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Free */}
          <div className="bg-chrome-bg rounded-lg p-4 sm:p-5">
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
          <div className="bg-accent/[0.03] border border-accent/20 rounded-lg p-4 sm:p-5">
            <p className="font-sans font-bold text-[14px] text-accent mb-1">Coldbase Pro</p>
            <p className="text-[11px] text-chrome-muted mb-4 leading-relaxed">The full suite, to help you close more opportunities.</p>
            <ul className="space-y-3">
              {proFeatures.map(f => (
                <li key={f.title} className="flex items-start gap-2">
                  <span className="text-accent text-[10px] mt-0.5 flex-shrink-0">✦</span>
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
        <div className="px-4 sm:px-6 pb-5 sm:pb-6 grid grid-cols-2 gap-3 sm:gap-4">
          {/* Monthly */}
          <button
            type="button"
            onClick={() => setSelectedPlan('monthly')}
            className={`rounded-lg p-3 sm:p-4 border text-left transition-colors ${
              selectedPlan === 'monthly'
                ? 'border-accent bg-accent/[0.04] ring-1 ring-accent/30'
                : 'border-chrome-border bg-chrome-bg hover:border-chrome-muted hover:bg-chrome-deep'
            }`}
          >
            <p className="text-[10px] sm:text-[11px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted mb-1">Monthly</p>
            <p className="font-display text-[22px] sm:text-[26px] font-bold text-chrome-text leading-none mb-0.5">
              $7<span className="text-[12px] sm:text-[13px] font-sans font-normal text-chrome-muted"> / mo</span>
            </p>
            <p className="text-[10px] text-chrome-muted">billed monthly</p>
          </button>

          {/* Annual */}
          <button
            type="button"
            onClick={() => setSelectedPlan('annual')}
            className={`rounded-lg p-3 sm:p-4 border relative text-left transition-colors ${
              selectedPlan === 'annual'
                ? 'border-accent bg-accent/[0.04] ring-1 ring-accent/30'
                : 'border-chrome-border bg-chrome-bg hover:border-chrome-muted hover:bg-chrome-deep'
            }`}
          >
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold font-sans uppercase tracking-[0.08em] bg-accent text-white px-2.5 py-0.5 rounded-full whitespace-nowrap">
              Save 29%
            </span>
            <p className="text-[10px] sm:text-[11px] font-semibold font-sans uppercase tracking-[0.1em] text-accent mb-1">Annual</p>
            <p className="font-display text-[22px] sm:text-[26px] font-bold text-chrome-text leading-none mb-0.5">
              $5<span className="text-[12px] sm:text-[13px] font-sans font-normal text-chrome-muted"> / mo</span>
            </p>
            <p className="text-[10px] text-chrome-muted">billed $60 / yr</p>
          </button>
        </div>

        {/* CTA */}
        <div className="px-4 sm:px-6 pb-6 sm:pb-8">
          <button
            type="button"
            onClick={handleGetStarted}
            disabled={loading}
            className="w-full py-3 bg-accent text-white font-semibold text-[14px] rounded-lg hover:bg-accent-hover transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? 'Redirecting…' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  );
}
