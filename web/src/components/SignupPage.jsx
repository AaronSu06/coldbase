import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authSignup } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import AuthShell, { GoogleIcon } from './AuthShell';
import EyeIcon from './icons/EyeIcon';
import EyeSlashIcon from './icons/EyeSlashIcon';

export default function SignupPage() {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirm, setConfirm]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const emailRef = useRef(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/\d/.test(password)) {
      setError('Password must include at least one number');
      return;
    }
    setLoading(true);
    try {
      const { token } = await authSignup(email, password);
      login(token);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {/* Wordmark — mobile only; desktop left panel provides brand anchor */}
      <span className="block md:hidden font-display text-2xl font-bold text-chrome-text leading-none tracking-tight mb-5">
        Reach
      </span>

      {/* Heading */}
      <h1 className="font-sans font-bold text-2xl text-chrome-text leading-snug mb-8">
        Create your account
      </h1>

      {/* Google OAuth (UI only — wire when provider is added) */}
      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-chrome-surface border border-chrome-border rounded-xl text-[14px] font-medium text-chrome-muted transition-colors cursor-pointer opacity-60"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5" role="separator" aria-hidden="true">
        <div className="flex-1 h-px bg-chrome-border" />
        <span className="text-[12px] text-chrome-muted font-sans select-none">or continue with email</span>
        <div className="flex-1 h-px bg-chrome-border" />
      </div>

      {/* Error */}
      {error && (
        <p className="mb-4 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5 font-sans">
          {error}
        </p>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[12px] font-semibold font-sans uppercase tracking-[0.08em] text-chrome-muted">
            Email
          </label>
          <input
            ref={emailRef}
            id="email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-chrome-border bg-chrome-surface text-[14px] font-sans text-chrome-text placeholder:text-chrome-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[12px] font-semibold font-sans uppercase tracking-[0.08em] text-chrome-muted">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              required
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-chrome-border bg-chrome-surface text-[14px] font-sans text-chrome-text placeholder:text-chrome-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-chrome-subtle hover:text-chrome-muted transition-colors"
            >
              {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[11px] text-chrome-subtle font-sans">
            At least 8 characters and one number
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-[12px] font-semibold font-sans uppercase tracking-[0.08em] text-chrome-muted">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-chrome-border bg-chrome-surface text-[14px] font-sans text-chrome-text placeholder:text-chrome-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full py-2.5 bg-accent text-white font-semibold text-[14px] rounded-xl hover:bg-accent-hover active:brightness-90 disabled:opacity-60 disabled:pointer-events-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      {/* Switch to login */}
      <p className="mt-5 text-[13px] font-sans text-chrome-muted">
        Already have an account?{' '}
        <Link
          to="/auth/login"
          className="text-accent hover:text-accent-hover transition-colors font-medium px-1 py-0.5 -ml-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
        >
          Sign in.
        </Link>
      </p>
    </AuthShell>
  );
}
