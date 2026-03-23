import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authLogin, authSignup } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import AuthShell, { GoogleIcon } from './AuthShell';

export default function AuthPage({ onLogin }) {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'signin');

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const emailRef = useRef(null);

  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  // Reset fields when switching modes
  function switchMode(next) {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      if (password !== confirm) { setError('Passwords do not match'); return; }
      if (password.length < 8)  { setError('Password must be at least 8 characters'); return; }
    }

    setLoading(true);
    try {
      const { token } = mode === 'signin'
        ? await authLogin(email, password)
        : await authSignup(email, password);
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
      {/* Wordmark */}
      <span className="font-display text-[18px] font-bold text-chrome-text leading-none tracking-tight block mb-3">
        Reach
      </span>

      {/* Mode tabs */}
      <div className="flex gap-0 mb-8 border-b border-chrome-border">
        {[{ id: 'signin', label: 'Sign in' }, { id: 'signup', label: 'Create account' }].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchMode(id)}
            className={`px-4 pb-2.5 text-[14px] font-semibold font-sans border-b-2 transition-all duration-150 -mb-px ${
              mode === id
                ? 'border-accent text-chrome-text'
                : 'border-transparent text-chrome-muted hover:text-chrome-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Google OAuth (UI only) */}
      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-chrome-surface border border-chrome-border rounded-xl text-[14px] font-medium text-chrome-muted transition-colors cursor-not-allowed opacity-60"
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
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[12px] font-semibold font-sans uppercase tracking-[0.08em] text-chrome-muted">
              Password
            </label>
            {mode === 'signin' && (
              <button
                type="button"
                className="text-[12px] text-accent hover:text-accent-hover transition-colors font-sans px-1 py-0.5 -mr-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
              >
                Forgot password?
              </button>
            )}
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-chrome-border bg-chrome-surface text-[14px] font-sans text-chrome-text placeholder:text-chrome-subtle focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
          />
        </div>

        {mode === 'signup' && (
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
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full py-2.5 bg-accent text-white font-semibold text-[14px] rounded-xl hover:bg-accent-hover active:brightness-90 disabled:opacity-60 disabled:pointer-events-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50"
        >
          {loading
            ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
            : (mode === 'signin' ? 'Sign in' : 'Create account')}
        </button>
      </form>
    </AuthShell>
  );
}
