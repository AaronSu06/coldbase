import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import OutreachCard from './OutreachCard';
import EmptyState from './EmptyState';
import { STATUS_COLORS } from '../lib/utils';

function KanbanColumn({ status, records, onCardClick, onToggleFavorite }) {
  // CRITICAL: id must exactly match the status string
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const itemIds = records.map(r => r.threadId);
  const statusColor = STATUS_COLORS[status] || '#3b82f6';

  return (
    <div
      className="h-full min-h-0 flex flex-col w-[85vw] sm:w-[280px] flex-shrink-0 border-r border-chrome-border last:border-r-0 snap-start"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-chrome-border bg-chrome-bg">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: statusColor }}
            aria-hidden="true"
          />
          <h3 className="font-sans font-semibold text-[10px] text-chrome-muted tracking-[0.1em] uppercase">
            {status}
          </h3>
        </div>
        <span className="font-mono text-[11px] text-chrome-muted/60">
          {records.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-0 p-3 flex flex-col gap-3 transition-colors duration-150 overflow-y-auto ${
          isOver ? 'bg-[rgba(184,82,18,0.06)]' : 'bg-transparent'
        }`}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {records.length === 0
            ? <EmptyState context="column" status={status} />
            : records.map(r => (
                <OutreachCard
                  key={r.threadId}
                  record={r}
                  onCardClick={onCardClick}
                  onToggleFavorite={onToggleFavorite}
                />
              ))
          }
        </SortableContext>
      </div>
    </div>
  );
}

export default memo(KanbanColumn);
