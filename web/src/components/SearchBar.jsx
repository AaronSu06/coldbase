export default function SearchBar({ query, onSearch }) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search company, contact, subject…"
        className="w-60 pl-9 pr-3 py-2 border border-gray-200 rounded-md text-[13px] text-gray-700 placeholder-gray-400 bg-white focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
      />
    </div>
  );
}
