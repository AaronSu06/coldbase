import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import OutreachCard from './OutreachCard';
import EmptyState from './EmptyState';

function KanbanColumn({ status, records, onCardClick, onToggleFavorite }) {
  // CRITICAL: id must exactly match the status string
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const itemIds = records.map(r => r.threadId);

  return (
    <div className="h-full min-h-0 flex flex-col w-[280px] flex-shrink-0 border-r border-dashed border-gray-200 last:border-r-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-dashed border-gray-200">
        <h3 className="font-semibold text-[11px] text-gray-400 tracking-[0.08em] uppercase">
          {status}
        </h3>
        <span className="font-mono text-[12px] text-gray-400">
          {records.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-0 p-3 transition-colors duration-150 overflow-y-auto ${
          isOver ? 'bg-accent-light/40' : 'bg-transparent'
        }`}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {records.length === 0
            ? <EmptyState context="column" />
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
