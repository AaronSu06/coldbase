// web/src/components/SettingsPage.jsx
import { useState, useRef, useEffect } from 'react';
import { TOKEN_KEY } from '../hooks/useAuth.js';
import { Upload, X, Star, ChevronDown, Check, FileText, Eye, EyeOff } from 'lucide-react';
import { fetchSettings, patchSettings, uploadResume, deleteResume, patchEmail, patchPassword, deleteAccount } from '../lib/api';

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

function PasswordField({ label, id, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-chrome-muted mb-1.5"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="w-full rounded-lg border border-chrome-border bg-chrome-bg px-3 py-2 pr-9 text-[14px] text-chrome-text placeholder:text-chrome-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-chrome-muted hover:text-chrome-text transition-colors"
        >
          {visible
            ? <EyeOff size={15} strokeWidth={1.75} aria-hidden="true" />
            : <Eye size={15} strokeWidth={1.75} aria-hidden="true" />
          }
        </button>
      </div>
    </div>
  );
}

function AccordionPanel({ isOpen, children }) {
  return (
    <div
      className={`grid motion-safe:transition-[grid-template-rows] motion-safe:duration-[250ms] motion-safe:[transition-timing-function:cubic-bezier(0.25,1,0.5,1)] ${
        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div
        className={`overflow-hidden min-h-0 motion-safe:transition-opacity motion-safe:duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {children}
      </div>
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

function FormStatus({ status, message }) {
  if (!status) return null;
  return (
    <p className={`text-[13px] font-medium ${status === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
      {message}
    </p>
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
  const isAnimating = useRef(false);
  const ANIM_MS = 260; // matches AccordionPanel 250ms + small buffer

  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load settings on mount
  useEffect(() => {
    fetchSettings()
      .then(data => {
        if (data.plan) setPlan(data.plan);
        if (data.emailDigest) setEmailDigest(data.emailDigest);
        setResumeName(data.resumeName ?? null);
        setSettingsLoaded(true);
      })
      .catch(e => console.error('[Reach] Failed to load settings:', e.message));
  }, []);

  // Change email form
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailFormStatus, setEmailFormStatus] = useState(null); // null | { type, message }

  // Change password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFormStatus, setPasswordFormStatus] = useState(null);

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState('');

  // Inline feedback
  const [digestStatus, setDigestStatus] = useState(null);
  const [resumeError, setResumeError] = useState(null);

  function resetForms() {
    setNewEmail(''); setEmailPassword('');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setDeleteConfirm('');
  }

  function handleClose() {
    if (isAnimating.current) return;
    isAnimating.current = true;
    setExpandedRow(null);
    setTimeout(() => { isAnimating.current = false; }, ANIM_MS);
  }

  function handleRowToggle(row) {
    if (isAnimating.current) return;
    isAnimating.current = true;

    if (expandedRow === row) {
      // Close
      setExpandedRow(null);
      setTimeout(() => { isAnimating.current = false; }, ANIM_MS);
    } else if (expandedRow !== null) {
      // Close current first, then open new one after animation completes
      setExpandedRow(null);
      setTimeout(() => {
        resetForms();
        setExpandedRow(row);
        setTimeout(() => { isAnimating.current = false; }, ANIM_MS);
      }, ANIM_MS);
    } else {
      // Nothing open — open directly
      resetForms();
      setExpandedRow(row);
      setTimeout(() => { isAnimating.current = false; }, ANIM_MS);
    }
  }

  async function handleChangeEmail(e) {
    e.preventDefault();
    setEmailFormStatus(null);
    try {
      await patchEmail(newEmail, emailPassword);
      setEmailFormStatus({ type: 'success', message: 'Saved ✓' });
      setTimeout(() => {
        handleClose();
        setEmailFormStatus(null);
      }, 2000);
    } catch (err) {
      const message = err.message.includes('409') ? 'That email is already in use'
        : err.message.includes('401') ? 'Incorrect password'
        : 'Something went wrong, please try again';
      setEmailFormStatus({ type: 'error', message });
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordFormStatus(null);
    if (newPassword !== confirmPassword) {
      setPasswordFormStatus({ type: 'error', message: "Passwords don't match" });
      return;
    }
    try {
      await patchPassword(currentPassword, newPassword);
      setPasswordFormStatus({ type: 'success', message: 'Saved ✓' });
      setTimeout(() => {
        handleClose();
        setPasswordFormStatus(null);
      }, 2000);
    } catch (err) {
      const message = err.message.includes('401') ? 'Incorrect password'
        : err.message.includes('400') ? 'New password must be at least 8 characters'
        : 'Something went wrong, please try again';
      setPasswordFormStatus({ type: 'error', message });
    }
  }

  async function handleDeleteAccount() {
    try {
      await deleteAccount();
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    } catch (e) {
      console.error('[Reach] Account deletion failed:', e.message);
    }
  }

  async function handleFileSelect(file) {
    if (!file) return;
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowed.includes(file.type)) {
      setResumeError('Only PDF, DOC, or DOCX files are accepted');
      return;
    }
    setResumeError(null);
    setIsUploading(true);
    try {
      const { resumeName: name } = await uploadResume(file);
      setResumeName(name);
    } catch (e) {
      console.error('[Reach] Resume upload failed:', e.message);
      setResumeError('Upload failed. Please try again.');
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
    setDigestStatus(null);
    try {
      await patchSettings({ emailDigest: value });
      setDigestStatus('success');
      setTimeout(() => setDigestStatus(null), 2000);
    } catch (e) {
      console.error('[Reach] Failed to save email digest:', e.message);
      setDigestStatus('error');
    }
  }

  return (
    <div className="flex flex-col h-full">
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
          {resumeError && (
            <p className="text-[13px] text-red-500 font-medium mt-2">{resumeError}</p>
          )}
        </section>

        {/* ── Notifications ──────────────────────────────────────────── */}
        <section aria-label="Notifications">
          <SectionTitle>Notifications</SectionTitle>

          <div className="rounded-lg border border-chrome-rim bg-chrome-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5 gap-4">
              <span className="text-[14px] text-chrome-text font-medium">Email me updates</span>
              <div
                className={`flex rounded-lg border border-chrome-border overflow-hidden transition-opacity duration-200 ${settingsLoaded ? 'opacity-100' : 'opacity-0'}`}
                role="radiogroup"
                aria-label="Email update frequency"
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
            {digestStatus && (
              <p className={`text-[12px] font-medium mt-1 px-4 pb-2 ${digestStatus === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                {digestStatus === 'success' ? 'Saved ✓' : 'Failed to save'}
              </p>
            )}
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
              <AccordionPanel isOpen={expandedRow === 'email'}>
                <form onSubmit={handleChangeEmail} className="px-4 pb-4 space-y-3 border-t border-chrome-border pt-3">
                  <InputField
                    label="New email address"
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={e => { setNewEmail(e.target.value); setEmailFormStatus(null); }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <InputField
                    label="Current password"
                    id="email-current-password"
                    type="password"
                    value={emailPassword}
                    onChange={e => { setEmailPassword(e.target.value); setEmailFormStatus(null); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <FormStatus status={emailFormStatus?.type} message={emailFormStatus?.message} />
                  <SaveCancel onCancel={handleClose} />
                </form>
              </AccordionPanel>
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
              <AccordionPanel isOpen={expandedRow === 'password'}>
                <form onSubmit={handleChangePassword} className="px-4 pb-4 space-y-3 border-t border-chrome-border pt-3">
                  <PasswordField
                    label="Current password"
                    id="current-password"
                    value={currentPassword}
                    onChange={e => { setCurrentPassword(e.target.value); setPasswordFormStatus(null); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <PasswordField
                    label="New password"
                    id="new-password"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setPasswordFormStatus(null); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <PasswordField
                    label="Confirm new password"
                    id="confirm-password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setPasswordFormStatus(null); }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <FormStatus status={passwordFormStatus?.type} message={passwordFormStatus?.message} />
                  <SaveCancel onCancel={handleClose} />
                </form>
              </AccordionPanel>
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
            <AccordionPanel isOpen={expandedRow === 'delete'}>
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
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirm !== 'DELETE'}
                    className="px-4 py-2 rounded-lg bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Delete my account
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 rounded-lg text-[13px] font-medium text-chrome-muted hover:text-chrome-text hover:bg-chrome-deep transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </AccordionPanel>
          </div>
        </section>

        </div>
      </div>
      </div>
    </div>
  );
}
