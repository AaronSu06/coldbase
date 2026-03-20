export default function SearchBar({ query, onSearch }) {
  return (
    <div className="relative w-full sm:w-auto">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-chrome-muted pointer-events-none"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search company, contact, subject…"
        aria-label="Search contacts"
        className="w-full sm:w-60 pl-9 pr-3 py-2 border border-chrome-border rounded-md text-[13px] text-chrome-muted placeholder-chrome-muted/50 bg-chrome-bg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
      />
    </div>
  );
}
