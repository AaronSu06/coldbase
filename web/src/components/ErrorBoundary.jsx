import { Component } from 'react';

// ── Error screen components ───────────────────────────────────────────────────

function ErrorScreen({ icon, title, message, onRetry }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-chrome-surface px-4">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <div className="w-12 h-12 rounded-full bg-chrome-surface flex items-center justify-center text-chrome-muted/40">
          {icon}
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-[14px] text-chrome-text">{title}</p>
          <p className="text-[13px] text-chrome-muted/70 leading-snug">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1 px-4 py-2 rounded-lg text-[13px] font-medium bg-chrome-surface border border-chrome-border text-chrome-text hover:bg-chrome-hover transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function NetworkErrorScreen({ onRetry }) {
  return (
    <ErrorScreen
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.584 10.587a2 2 0 002.828 2.828M9.172 9.172A4 4 0 0114.83 14.83m1.415 1.415A6 6 0 016.343 6.343m10.314 0A6 6 0 0117.657 17.657M4.929 4.929A10 10 0 0019.07 19.07" />
        </svg>
      }
      title="Can't connect to server"
      message="Check your internet connection and try again."
      onRetry={onRetry}
    />
  );
}

function ServerErrorScreen({ onRetry }) {
  return (
    <ErrorScreen
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      }
      title="Something went wrong"
      message="An unexpected error occurred. We've been notified and are looking into it."
      onRetry={onRetry}
    />
  );
}

function NotFoundScreen() {
  return (
    <ErrorScreen
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
      }
      title="Page not found"
      message="This page doesn't exist or you don't have permission to view it."
    />
  );
}

// ── ErrorBoundary class component ─────────────────────────────────────────────

function classifyError(error) {
  if (!error) return 'generic';
  const msg = error.message?.toLowerCase() ?? '';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network request failed')) {
    return 'network';
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return 'notfound';
  }
  return 'server';
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console in dev; Sentry picks this up automatically in prod
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const errorType = classifyError(this.state.error);

    if (errorType === 'network') {
      return <NetworkErrorScreen onRetry={this.handleReset} />;
    }
    if (errorType === 'notfound') {
      return <NotFoundScreen />;
    }
    return <ServerErrorScreen onRetry={this.handleReset} />;
  }
}
