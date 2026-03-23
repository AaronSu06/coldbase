// web/src/components/SettingsPage.jsx
import { useState, useRef, useEffect } from 'react';
import { Upload, X, Star, ChevronDown, Check, FileText } from 'lucide-react';
import { fetchSettings, patchSettings, uploadResume, deleteResume } from '../lib/api';

function SectionTitle({ children, className = '' }) {
  return (
    <h2 className={`text-[11px] font-semibold uppercase tracking-[0.08em] text-chrome-muted mb-3 ${className}`}>
      {children}
    </h2>
  );
}

function InputField({ label, id, ...props }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-chrome-muted mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        className="w-full rounded-lg border border-chrome-border bg-chrome-bg px-3 py-2 text-[14px] text-chrome-text placeholder:text-chrome-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
        {...props}
      />
    </div>
  );
}

function SaveCancel({ onCancel }) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        type="submit"
        className="px-4 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover transition-colors"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 rounded-lg text-[13px] font-medium text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

const PRO_FEATURES = [
  'Unlimited contacts & outreach campaigns',
  'Advanced analytics and reply tracking',
  'Priority email delivery',
];

function PlanSection({ plan = 'free' }) {
  if (plan === 'pro') {
    return (
      <section aria-label="Plan">
        <SectionTitle>Plan</SectionTitle>
        <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">
          <div className="px-4 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <Star size={13} className="text-accent fill-accent flex-shrink-0" aria-hidden="true" />
                  <span className="text-[14px] font-semibold text-chrome-text">Reach Pro</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
                    <Check size={10} strokeWidth={2.5} aria-hidden="true" />
                    Active
                  </span>
                </div>
                <ul className="space-y-1 mt-2">
                  {PRO_FEATURES.map(f => (
                    <li key={f} className="flex items-center gap-2 text-[13px] text-chrome-muted">
                      <Check size={12} className="text-accent flex-shrink-0" strokeWidth={2.5} aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-chrome-border px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-chrome-muted">Billing managed through Stripe</span>
            <button className="text-[13px] font-medium text-accent hover:text-accent-hover transition-colors">
              Manage subscription →
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Plan">
      <SectionTitle>Plan</SectionTitle>
      <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-chrome-deep border border-chrome-border text-[11px] font-semibold text-chrome-muted uppercase tracking-wide">
                  Free
                </span>
                <span className="text-[13px] text-chrome-muted">Upgrade to unlock:</span>
              </div>
              <ul className="space-y-1 mt-2">
                {PRO_FEATURES.map(f => (
                  <li key={f} className="flex items-center gap-2 text-[13px] text-chrome-muted">
                    <Star size={11} className="text-accent/60 flex-shrink-0" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <button className="flex-shrink-0 mt-0.5 px-4 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold hover:bg-accent-hover transition-colors whitespace-nowrap">
              Upgrade →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  // Settings loaded from server
  const [plan, setPlan] = useState('free');
  const [emailDigest, setEmailDigest] = useState('weekly');

  // Resume
  const [resumeName, setResumeName] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Account — which row is expanded
  const [expandedRow, setExpandedRow] = useState(null);

  // Load settings on mount
  useEffect(() => {
    fetchSettings()
      .then(data => {
        if (data.plan) setPlan(data.plan);
        if (data.emailDigest) setEmailDigest(data.emailDigest);
        setResumeName(data.resumeName ?? null);
      })
      .catch(e => console.error('[Reach] Failed to load settings:', e.message));
  }, []);

  // Change email form
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState('');

  function handleRowToggle(row) {
    if (expandedRow === row) {
      setExpandedRow(null);
    } else {
      setExpandedRow(row);
      // Reset all forms when switching rows
      setNewEmail(''); setEmailPassword('');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setDeleteConfirm('');
    }
  }

  async function handleFileSelect(file) {
    if (!file) return;
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.type)) return;
    setIsUploading(true);
    try {
      const { resumeName: name } = await uploadResume(file);
      setResumeName(name);
    } catch (e) {
      console.error('[Reach] Resume upload failed:', e.message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteResume() {
    try {
      await deleteResume();
      setResumeName(null);
    } catch (e) {
      console.error('[Reach] Resume delete failed:', e.message);
    }
  }

  async function handleDigestChange(value) {
    setEmailDigest(value);
    try {
      await patchSettings({ emailDigest: value });
    } catch (e) {
      console.error('[Reach] Failed to save email digest:', e.message);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Sub-header strip — mirrors tracker sub-nav ─────────────────────── */}
      <div className="bg-chrome-bg border-b border-chrome-border px-4 sm:px-8 flex items-stretch h-11 flex-shrink-0">
        <span className="flex items-center text-[13px] font-display font-semibold text-chrome-text border-b-2 border-accent">
          Settings
        </span>
      </div>

      <div className="flex-1 overflow-y-auto bg-chrome-bg">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-10">

        <div className="space-y-10">

        {/* ── Resume ─────────────────────────────────────────────────── */}
        <section aria-label="Resume">
          <SectionTitle>Resume</SectionTitle>

          {resumeName ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-orange-200 bg-orange-50">
              <FileText size={16} strokeWidth={1.75} className="text-accent flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 text-[13px] text-chrome-text font-medium truncate min-w-0">
                {resumeName}
              </span>
              <button
                onClick={handleDeleteResume}
                aria-label="Remove resume"
                className="w-6 h-6 rounded-md flex items-center justify-center text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors flex-shrink-0"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setIsDragging(false);
                handleFileSelect(e.dataTransfer.files[0]);
              }}
              className={`rounded-lg border-2 border-dashed px-6 py-8 flex flex-col items-center gap-3 transition-colors ${
                isUploading
                  ? 'border-accent/40 bg-accent/5 pointer-events-none'
                  : isDragging
                  ? 'border-accent bg-accent/5'
                  : 'border-chrome-border bg-chrome-surface hover:border-chrome-muted'
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-chrome-deep flex items-center justify-center">
                <Upload size={18} className="text-chrome-muted" aria-hidden="true" />
              </div>
              <div className="text-center">
                <p className="text-[14px] text-chrome-text font-medium">
                  {isUploading ? 'Uploading…' : 'Drag your resume here'}
                </p>
                <p className="text-[12px] text-chrome-muted mt-0.5">PDF, DOC, or DOCX</p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[13px] font-semibold text-accent hover:text-accent-hover transition-colors"
              >
                Browse files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                aria-label="Upload resume"
                onChange={e => handleFileSelect(e.target.files[0])}
              />
            </div>
          )}
        </section>

        {/* ── Notifications ──────────────────────────────────────────── */}
        <section aria-label="Notifications">
          <SectionTitle>Notifications</SectionTitle>

          <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 gap-4">
              <span className="text-[14px] text-chrome-text font-medium">Email digest</span>
              <div
                className="flex rounded-lg border border-chrome-border overflow-hidden"
                role="radiogroup"
                aria-label="Email digest frequency"
              >
                {['Daily', 'Weekly', 'Never'].map((opt, i) => (
                  <label key={opt} className="cursor-pointer">
                    <input
                      type="radio"
                      name="emailDigest"
                      value={opt.toLowerCase()}
                      checked={emailDigest === opt.toLowerCase()}
                      onChange={() => handleDigestChange(opt.toLowerCase())}
                      className="sr-only"
                    />
                    <span className={`
                      block px-4 py-1.5 text-[13px] font-medium select-none transition-colors
                      ${i > 0 ? 'border-l border-chrome-border' : ''}
                      ${emailDigest === opt.toLowerCase()
                        ? 'bg-accent text-white'
                        : 'text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep'
                      }
                    `}>
                      {opt}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Plan ───────────────────────────────────────────────────── */}
        <PlanSection plan={plan} />

        {/* ── Account ────────────────────────────────────────────────── */}
        <section aria-label="Account">
          <SectionTitle>Account</SectionTitle>

          <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">

            {/* Change email */}
            <div>
              <button
                onClick={() => handleRowToggle('email')}
                aria-expanded={expandedRow === 'email'}
                className="w-full flex items-center justify-between px-4 py-3.5 text-[14px] font-medium text-chrome-text hover:bg-chrome-deep transition-colors"
              >
                <span>Change email</span>
                <ChevronDown
                  size={15}
                  className={`text-chrome-muted transition-transform duration-200 ${expandedRow === 'email' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {expandedRow === 'email' && (
                <div className="px-4 pb-4 space-y-3 border-t border-chrome-border pt-3">
                  <InputField
                    label="New email address"
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <InputField
                    label="Current password"
                    id="email-current-password"
                    type="password"
                    value={emailPassword}
                    onChange={e => setEmailPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <SaveCancel onCancel={() => setExpandedRow(null)} />
                </div>
              )}
            </div>

            {/* Change password */}
            <div className="border-t border-chrome-border">
              <button
                onClick={() => handleRowToggle('password')}
                aria-expanded={expandedRow === 'password'}
                className="w-full flex items-center justify-between px-4 py-3.5 text-[14px] font-medium text-chrome-text hover:bg-chrome-deep transition-colors"
              >
                <span>Change password</span>
                <ChevronDown
                  size={15}
                  className={`text-chrome-muted transition-transform duration-200 ${expandedRow === 'password' ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {expandedRow === 'password' && (
                <div className="px-4 pb-4 space-y-3 border-t border-chrome-border pt-3">
                  <InputField
                    label="Current password"
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <InputField
                    label="New password"
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <InputField
                    label="Confirm new password"
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <SaveCancel onCancel={() => setExpandedRow(null)} />
                </div>
              )}
            </div>

          </div>
        </section>

        {/* ── Danger zone ─────────────────────────────────────────────── */}
        <section aria-label="Danger zone">
          <SectionTitle className="text-red-400">Danger zone</SectionTitle>

          <div className="rounded-lg border border-red-200 bg-chrome-card overflow-hidden">
            <button
              onClick={() => handleRowToggle('delete')}
              aria-expanded={expandedRow === 'delete'}
              className="w-full flex items-center justify-between px-4 py-3.5 text-[14px] font-medium text-red-500 hover:bg-red-50/50 transition-colors"
            >
              <span>Delete account</span>
              <ChevronDown
                size={15}
                className={`text-red-400 transition-transform duration-200 ${expandedRow === 'delete' ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {expandedRow === 'delete' && (
              <div className="px-4 pb-4 space-y-3 border-t border-red-100 pt-3">
                <p className="text-[13px] text-chrome-muted">
                  This action is permanent and cannot be undone. All your data will be deleted.
                </p>
                <div>
                  <label
                    htmlFor="delete-confirm"
                    className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-chrome-muted mb-1.5"
                  >
                    Type DELETE to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirm}
                    onChange={e => setDeleteConfirm(e.target.value)}
                    placeholder="DELETE"
                    className="w-full rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-[14px] text-chrome-text placeholder:text-chrome-muted/50 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/20 transition-colors"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={deleteConfirm !== 'DELETE'}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete my account
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedRow(null)}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        </div>
      </div>
      </div>
    </div>
  );
}
