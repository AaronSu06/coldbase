import { memo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CompanyAvatar from './CompanyAvatar';
import HeartIcon from './icons/HeartIcon';
import BellIcon from './icons/BellIcon';
import ChatIcon from './icons/ChatIcon';
import EyeIcon from './icons/EyeIcon';
import { getDaysSince } from '../lib/utils';
import { Pencil } from 'lucide-react';


function OutreachCard({ record, onCardClick, onToggleFavorite }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: record.threadId,
    data: { status: record.status },
  });

  const slideTransition = transition
    ? transition.replace('ease', 'cubic-bezier(0.25, 1, 0.5, 1)')
    : undefined;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging
      ? slideTransition
      : [slideTransition, 'opacity 150ms ease-out'].filter(Boolean).join(', '),
    opacity: isDragging ? 0 : 1,
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
      className="group relative bg-chrome-card rounded-lg border border-chrome-rim py-3.5 px-4 cursor-grab shadow-card hover:shadow-card-hover hover:-translate-y-px transition-all duration-150"
    >
      {/* Row 1: Avatar + Company name + Edit + Favorite */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <CompanyAvatar domain={record.domain} company={record.company} />
        <p className="flex-1 font-bold text-[15px] text-chrome-text truncate leading-tight">
          {record.company}
        </p>
        <button
          onClick={e => { e.stopPropagation(); onCardClick?.(record); }}
          aria-label="Edit record"
          className="flex-shrink-0 p-1.5 rounded text-chrome-muted/50 hover:text-chrome-muted transition-colors duration-150"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite?.(record.threadId); }}
          aria-label={record.favorite ? 'Remove from favorites' : 'Add to favorites'}
          className={`flex-shrink-0 p-1.5 rounded transition-all duration-150 ${
            record.favorite
              ? 'text-rose-500'
              : 'text-stone-300 hover:text-rose-400'
          }`}
        >
          <HeartIcon filled={!!record.favorite} />
        </button>
      </div>

      {/* Row 2: Contact + Subject */}
      <p className="text-[12px] text-chrome-muted truncate mb-0.5">{record.contactName}</p>
      <p className="text-[11px] text-chrome-muted/60 truncate mb-3">{record.subject}</p>

      {/* Row 3: Days ago + indicators */}
      <div className="flex items-center gap-2">
        {(() => {
          const days = getDaysSince(record.sentDate);
          const label = days >= 5 ? '5+ days ago' : `${days}d ago`;
          const color = days >= 5 ? 'text-red-500' : days >= 2 ? 'text-amber-600' : 'text-chrome-muted/60';
          return <p className={`font-mono text-[11px] ${color}`}>{label}</p>;
        })()}
        <div className="flex items-center gap-1.5 ml-auto">
          {getDaysSince(record.sentDate) >= 3 && (
            <span role="img" aria-label="Follow up recommended" title="Follow up recommended" className="text-amber-600">
              <BellIcon className="w-3.5 h-3.5" />
            </span>
          )}
          {(record.messageCount || 1) > 1 && (
            <span role="img" aria-label={`${record.messageCount} messages`} title={`${record.messageCount} messages`} className="flex items-center gap-0.5 text-violet-600">
              <ChatIcon className="w-3.5 h-3.5" />
              <span aria-hidden="true" className="font-mono text-[10px]">{record.messageCount}</span>
            </span>
          )}
          <span
            role="img"
            aria-label={record.isOpened ? `Opened ${record.openCount} time${record.openCount !== 1 ? 's' : ''}${record.lastOpenedAt ? `, last ${new Date(record.lastOpenedAt).toLocaleDateString()}` : ''}` : 'Not opened yet'}
            title={record.isOpened ? `Opened ${record.openCount}x${record.lastOpenedAt ? ` — last ${new Date(record.lastOpenedAt).toLocaleDateString()}` : ''}` : 'Not opened yet'}
            className={`flex items-center gap-0.5 ${record.isOpened ? 'text-emerald-600' : 'text-stone-300'}`}
          >
            <EyeIcon className="w-3.5 h-3.5" />
            {record.isOpened && record.openCount > 1 && <span className="font-mono text-[10px]">{record.openCount}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

function areEqual(prev, next) {
  return (
    prev.record.threadId    === next.record.threadId    &&
    prev.record.company     === next.record.company     &&
    prev.record.domain      === next.record.domain      &&
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
