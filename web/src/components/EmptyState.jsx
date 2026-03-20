function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-chrome-muted/40">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

const COLUMN_COPY = {
  Sent:         { headline: 'No outreach sent',     sub: 'Emails you send via the extension will appear here' },
  Replied:      { headline: 'No replies yet',        sub: 'Contacts who write back will move here automatically' },
  Applied:      { headline: 'No applications yet',  sub: 'Mark a contact as Applied after submitting your materials' },
  Interviewing: { headline: 'No active interviews', sub: 'Move contacts here when you land an interview' },
  Offer:        { headline: 'No offers yet',        sub: "They're coming — drag a card here when one arrives" },
  Ghosted:      { headline: 'Gone quiet?',          sub: 'Drag contacts here when they stop responding' },
};

export default function EmptyState({ context, query, status }) {
  if (context === 'column') {
    const copy = COLUMN_COPY[status] || { headline: 'Nothing here', sub: null };
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-6 px-4 text-center">
        <span className="text-[12px] font-medium text-chrome-muted/50">{copy.headline}</span>
        {copy.sub && <span className="text-[11px] text-chrome-muted/30 leading-snug">{copy.sub}</span>}
      </div>
    );
  }

  if (context === 'search') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center px-6">
        <SearchIcon />
        <p className="font-semibold text-[14px] text-chrome-muted">
          {query ? `No results for "${query}"` : 'No results found'}
        </p>
        <p className="text-[13px] text-chrome-muted/60 max-w-xs">Try a different company name or contact</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
      <p className="font-semibold text-[14px] text-chrome-muted">No outreach logged yet</p>
      <p className="text-[13px] text-chrome-muted/60 max-w-xs">Install the extension and open Gmail to start tracking</p>
    </div>
  );
}
