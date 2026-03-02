function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-gray-300">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export default function EmptyState({ context, query }) {
  if (context === 'column') {
    return (
      <div className="flex items-center justify-center py-6">
        <span className="text-[12px] text-gray-300">Nothing here</span>
      </div>
    );
  }

  if (context === 'search') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
        <SearchIcon />
        <p className="font-semibold text-[14px] text-gray-600">
          {query ? `No results for "${query}"` : 'No results found'}
        </p>
        <p className="text-[13px] text-gray-400 max-w-xs">Try a different company name or contact</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
      <p className="font-semibold text-[14px] text-gray-500">No outreach logged yet</p>
      <p className="text-[13px] text-gray-400 max-w-xs">Install the extension and open Gmail to start tracking</p>
    </div>
  );
}
