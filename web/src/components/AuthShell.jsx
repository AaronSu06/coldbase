// Shared layout shell for LoginPage and SignupPage

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function FeatureCard({ label }) {
  return (
    <div className="feature-card rounded-lg border border-chrome-rim shadow-card bg-chrome-surface aspect-video overflow-hidden flex items-center justify-center cursor-default select-none">
      <span className="font-mono text-[11px] text-chrome-subtle uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}

// ── AuthShell ──────────────────────────────────────────────────────────────
// children = the right-panel form content

export default function AuthShell({ children }) {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-chrome-bg">

      {/* ── Left panel — marketing ──────────────────────────────────────── */}
      <div className="hidden md:block flex-1 w-full overflow-y-auto bg-chrome-bg border-r border-chrome-border">
        <div className="px-12 py-16 pb-24">

          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-md bg-accent overflow-hidden flex items-center justify-center flex-shrink-0">
              <img src="/logo.png" alt="" className="w-full h-full object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />
            </span>
            <h2 className="font-display text-5xl sm:text-6xl font-bold text-chrome-text leading-none tracking-tight">
              Coldbase
            </h2>
          </div>
          <p className="mt-3 font-sans text-xl font-semibold text-chrome-muted leading-snug">
            Track every outreach. Land more replies.
          </p>
          <p className="mt-5 font-sans text-[15px] text-chrome-muted leading-relaxed">
            Job searching is a numbers game. Reach makes sure none of those numbers slip through the cracks.
          </p>

          <div className="mt-10 flex flex-col gap-5 w-full">
            <FeatureCard label="Feature screenshot" />
            <FeatureCard label="Feature screenshot" />
            <FeatureCard label="Feature screenshot" />
          </div>
        </div>
      </div>

      {/* ── Right panel — form slot ─────────────────────────────────────── */}
      <div className="w-full md:w-[40%] flex-shrink-0 flex flex-col justify-center overflow-y-auto px-10 sm:px-14 py-10 bg-chrome-bg">
        <div className="w-full max-w-sm mx-auto">
          {children}
        </div>
      </div>

      <style>{`
        .feature-card {
          transition: transform 200ms ease-out, box-shadow 200ms ease-out;
        }
        .feature-card:hover {
          transform: scale(1.015);
          box-shadow: 0 0 0 6px rgba(184,82,18,0.07), 0 8px 32px rgba(0,0,0,0.08);
        }
        @media (prefers-reduced-motion: reduce) {
          .feature-card { transition: box-shadow 200ms ease-out; }
          .feature-card:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

export { GoogleIcon };
