// web/src/components/ProModal.jsx
import { useState } from 'react';
import { createCheckoutSession } from '../lib/api';

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

export default function ProModal({ onClose }) {
  const [selectedPlan, setSelectedPlan] = useState('annual');
  const [loading, setLoading] = useState(false);

  async function handleGetStarted() {
    setLoading(true);
    try {
      const { url } = await createCheckoutSession(selectedPlan);
      window.location.href = url;
    } catch (e) {
      console.error('[Reach] Checkout failed:', e.message);
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-chrome-surface rounded-xl shadow-card-drag w-full max-w-2xl max-h-[90vh] overflow-y-auto"
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
          <div className="bg-chrome-bg rounded-lg p-5">
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
          <div className="bg-accent/[0.03] border border-accent/20 rounded-lg p-5">
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
          <button
            type="button"
            onClick={() => setSelectedPlan('monthly')}
            className={`rounded-lg p-4 border text-left transition-colors ${
              selectedPlan === 'monthly'
                ? 'border-accent bg-accent/[0.04] ring-1 ring-accent/30'
                : 'border-chrome-border bg-chrome-bg hover:border-chrome-muted hover:bg-chrome-deep'
            }`}
          >
            <p className="text-[11px] font-semibold font-sans uppercase tracking-[0.1em] text-chrome-muted mb-1">Monthly</p>
            <p className="font-display text-[26px] font-bold text-chrome-text leading-none mb-0.5">
              $19<span className="text-[13px] font-sans font-normal text-chrome-muted"> / mo</span>
            </p>
            <p className="text-[10px] text-chrome-muted">billed monthly</p>
          </button>

          {/* Annual */}
          <button
            type="button"
            onClick={() => setSelectedPlan('annual')}
            className={`rounded-lg p-4 border relative text-left transition-colors ${
              selectedPlan === 'annual'
                ? 'border-accent bg-accent/[0.04] ring-1 ring-accent/30'
                : 'border-chrome-border bg-chrome-bg hover:border-chrome-muted hover:bg-chrome-deep'
            }`}
          >
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold font-sans uppercase tracking-[0.08em] bg-accent text-white px-2.5 py-0.5 rounded-full whitespace-nowrap">
              Save 21%
            </span>
            <p className="text-[11px] font-semibold font-sans uppercase tracking-[0.1em] text-accent mb-1">Annual</p>
            <p className="font-display text-[26px] font-bold text-chrome-text leading-none mb-0.5">
              $15<span className="text-[13px] font-sans font-normal text-chrome-muted"> / mo</span>
            </p>
            <p className="text-[10px] text-chrome-muted">billed $180 / yr</p>
          </button>
        </div>

        {/* CTA */}
        <div className="px-6 pb-8">
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
