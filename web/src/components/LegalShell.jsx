// web/src/components/LegalShell.jsx
import { Link } from 'react-router-dom';

export function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display font-bold text-[18px] text-chrome-text mb-3">{title}</h2>
      <div className="text-chrome-muted space-y-3">{children}</div>
    </section>
  );
}

export default function LegalShell({ title, children, lastUpdated = 'April 6, 2026' }) {
  return (
    <div className="min-h-screen bg-chrome-bg px-6 py-12">
      <div className="max-w-2xl mx-auto">

        {/* Logo + wordmark */}
        <div className="flex items-center gap-2.5 mb-10">
          <img src="/logo.png" alt="" className="w-7 h-7 flex-shrink-0" onError={e => { e.currentTarget.style.display = 'none'; }} />
          <span className="font-display text-2xl font-bold text-chrome-text leading-none tracking-tight">
            Coldbase
          </span>
        </div>

        {/* Page title */}
        <h1 className="font-display text-3xl font-bold text-chrome-text mb-2">{title}</h1>
        <p className="text-[13px] text-chrome-muted mb-10">Last updated: {lastUpdated}</p>

        <main>
          {/* Content */}
          <div className="font-sans text-[14px] text-chrome-text leading-relaxed space-y-8">
            {children}
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-chrome-border">
            <Link
              to="/auth/login"
              className="text-[13px] text-accent hover:text-accent-hover transition-colors"
            >
              ← Back to sign in
            </Link>
          </div>
        </main>

      </div>
    </div>
  );
}
