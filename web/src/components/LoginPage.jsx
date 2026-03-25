import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authLogin } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import AuthShell, { GoogleIcon } from './AuthShell';
import EyeIcon from './icons/EyeIcon';
import EyeSlashIcon from './icons/EyeSlashIcon';

export default function LoginPage({ onLogin }) {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
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
    setLoading(true);
    try {
      const { token } = await authLogin(email, password);
      login(token);
      onLogin?.();
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      {/* Logo + Wordmark — mobile only; desktop left panel provides brand anchor */}
      <div className="flex md:hidden items-center gap-2 mb-5">
        <span className="w-6 h-6 rounded-sm bg-accent overflow-hidden flex items-center justify-center flex-shrink-0">
          <img src="/logo.png" alt="" className="w-full h-full object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
        </span>
        <span className="font-display text-2xl font-bold text-chrome-text leading-none tracking-tight">
          Coldbase
        </span>
      </div>

      {/* Heading */}
      <h1 className="font-sans font-bold text-2xl text-chrome-text leading-snug mb-8">
        Sign in to your account
      </h1>

      {/* Google OAuth (UI only — wire when provider is added) */}
      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-chrome-surface border border-chrome-border rounded-lg text-[14px] font-medium text-chrome-muted transition-colors cursor-pointer opacity-60"
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
        <p className="mb-4 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 font-sans">
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
            className="w-full px-3.5 py-2.5 rounded-lg border border-chrome-border bg-chrome-surface text-[14px] font-sans text-chrome-text placeholder:text-chrome-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[12px] font-semibold font-sans uppercase tracking-[0.08em] text-chrome-muted">
              Password
            </label>
            <button
              type="button"
              className="text-[12px] text-accent hover:text-accent-hover transition-colors font-sans px-1 py-0.5 -mr-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
              className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-chrome-border bg-chrome-surface text-[14px] font-sans text-chrome-text placeholder:text-chrome-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
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
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full py-2.5 bg-accent text-white font-semibold text-[14px] rounded-lg hover:bg-accent-hover active:brightness-90 disabled:opacity-60 disabled:pointer-events-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {/* Switch to signup */}
      <p className="mt-5 text-[13px] font-sans text-chrome-muted">
        Don't have an account?{' '}
        <Link
          to="/auth/register"
          className="text-accent hover:text-accent-hover transition-colors font-medium px-1 py-0.5 -ml-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
        >
          Register.
        </Link>
      </p>
    </AuthShell>
  );
}
