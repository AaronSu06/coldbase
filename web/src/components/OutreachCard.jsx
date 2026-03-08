import { memo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CompanyAvatar from './CompanyAvatar';
import HeartIcon from './icons/HeartIcon';
import { getDaysSince, STATUS_COLORS } from '../lib/utils';

function EnvelopeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 flex-shrink-0 text-gray-300">
      <path d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 flex-shrink-0 text-gray-300">
      <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3 h-3 flex-shrink-0 text-gray-300">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function EyeIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
      <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function OutreachCard({ record, onCardClick, onToggleFavorite }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: record.threadId,
    data: { status: record.status },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    borderLeftColor: STATUS_COLORS[record.status] || '#e5e7eb',
  };

  const handleClick = useCallback(() => {
    if (!isDragging) onCardClick?.(record);
  }, [isDragging, onCardClick, record]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className="group relative bg-white rounded-lg border border-gray-200 border-l-[3px] py-3.5 px-4 mb-2 cursor-grab shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-150"
    >
      {/* Row 1: Avatar + Company name + Favorite */}
      <div className="flex items-center gap-2 mb-2">
        <CompanyAvatar domain={record.domain} company={record.company} />
        <p className="flex-1 font-semibold text-[14px] text-[#0a0a0a] truncate leading-tight">
          {record.company}
        </p>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite?.(record.threadId); }}
          className={`flex-shrink-0 p-0.5 rounded transition-all duration-150 ${
            record.favorite
              ? 'text-rose-500'
              : 'text-gray-300 hover:text-rose-400'
          }`}
        >
          <HeartIcon filled={!!record.favorite} />
        </button>
      </div>

      {/* Row 2: Subject */}
      <div className="flex items-center gap-1.5 mb-1">
        <EnvelopeIcon />
        <p className="text-[12px] text-gray-500 truncate">{record.subject}</p>
      </div>

      {/* Row 3: Contact */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <PersonIcon />
        <p className="text-[12px] text-gray-500 truncate">{record.contactName}</p>
      </div>

      {/* Row 4: Days ago + message count + follow-up tag */}
      <div className="flex items-center gap-1.5">
        <ClockIcon />
        {(() => {
          const days = getDaysSince(record.sentDate);
          const label = days >= 5 ? '5+ days ago' : `${days}d ago`;
          const color = days >= 4 ? 'text-red-500' : days >= 2 ? 'text-yellow-500' : 'text-gray-400';
          return <p className={`font-mono text-[11px] ${color}`}>{label}</p>;
        })()}
        <div className="flex items-center gap-1 ml-auto">
          {getDaysSince(record.sentDate) >= 3 && (
            <span className="font-mono text-[11px] bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded">
              follow up
            </span>
          )}
          {(record.messageCount || 1) > 1 && (
            <span className="font-mono text-[11px] bg-accent-light text-accent px-1.5 py-0.5 rounded">
              {record.messageCount} msgs
            </span>
          )}
          {record.isOpened && (
            <span
              title={`Opened ${record.openCount}x${record.lastOpenedAt ? ` — last ${new Date(record.lastOpenedAt).toLocaleDateString()}` : ''}`}
              className="flex items-center gap-0.5 text-indigo-400"
            >
              <EyeIcon className="w-3 h-3" />
              {record.openCount > 1 && <span className="font-mono text-[10px]">{record.openCount}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function areEqual(prev, next) {
  return (
    prev.record.threadId    === next.record.threadId    &&
    prev.record.company     === next.record.company     &&
    prev.record.subject     === next.record.subject     &&
    prev.record.contactName === next.record.contactName &&
    prev.record.status      === next.record.status      &&
    prev.record.favorite    === next.record.favorite    &&
    prev.record.messageCount=== next.record.messageCount&&
    prev.record.sentDate    === next.record.sentDate    &&
    prev.record.isOpened    === next.record.isOpened    &&
    prev.record.openCount   === next.record.openCount   &&
    prev.record.lastOpenedAt=== next.record.lastOpenedAt&&
    prev.onCardClick        === next.onCardClick        &&
    prev.onToggleFavorite   === next.onToggleFavorite
  );
}

export default memo(OutreachCard, areEqual);
