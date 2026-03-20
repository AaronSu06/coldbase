import { useState, useEffect, useMemo, useRef } from 'react';
import {
  DndContext, DragOverlay, closestCorners,
  MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { arrayMove } from '@dnd-kit/sortable';
import { COLUMNS } from '@shared/constants';
import KanbanColumn from './KanbanColumn';
import OutreachCard from './OutreachCard';

const ORDER_KEY = 'outreachiq-card-order';


function loadOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY)) || {}; }
  catch { return {}; }
}

function saveOrder(columns) {
  const order = {};
  for (const [col, recs] of Object.entries(columns)) {
    order[col] = recs.map(r => r.threadId);
  }
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
  return order;
}

function buildColumns(recs, savedOrder = {}) {
  const map = {};
  for (const col of COLUMNS) map[col] = [];
  for (const r of recs) if (map[r.status]) map[r.status].push(r);

  // Apply saved order within each column; unknown (new) cards go to the end
  for (const col of COLUMNS) {
    const order = savedOrder[col];
    if (!order?.length) continue;
    const orderMap = new Map(order.map((id, i) => [id, i]));
    map[col].sort((a, b) => {
      const ai = orderMap.has(a.threadId) ? orderMap.get(a.threadId) : Infinity;
      const bi = orderMap.has(b.threadId) ? orderMap.get(b.threadId) : Infinity;
      return ai - bi;
    });
  }
  return map;
}

export default function KanbanBoard({ records, onStatusChange, onCardClick, visibleColumns, onToggleFavorite }) {
  const mouseSensor    = useSensor(MouseSensor,    { activationConstraint: { distance: 8 } });
  const touchSensor    = useSensor(TouchSensor,    { activationConstraint: { delay: 250, tolerance: 5 } });
  const keyboardSensor = useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates });
  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  const savedOrderRef = useRef(loadOrder());
  const [activeId, setActiveId] = useState(null);
  const [localColumns, setLocalColumns] = useState(() => buildColumns(records, savedOrderRef.current));

  // Sync from props when not dragging — preserves saved order
  useEffect(() => {
    if (!activeId) setLocalColumns(buildColumns(records, savedOrderRef.current));
  }, [records, activeId]);

  function findColumn(id) {
    if (COLUMNS.includes(id)) return id;
    for (const col of COLUMNS) {
      if (localColumns[col]?.some(r => r.threadId === id)) return col;
    }
    return null;
  }

  function handleDragStart({ active }) {
    setActiveId(active.id);
  }

  function handleDragOver({ active, over }) {
    if (!over) return;
    const fromCol = findColumn(active.id);
    const toCol = findColumn(over.id);
    if (!fromCol || !toCol || fromCol === toCol) return;

    setLocalColumns(prev => {
      const dragged = prev[fromCol].find(r => r.threadId === active.id);
      if (!dragged) return prev;
      const newFrom = prev[fromCol].filter(r => r.threadId !== active.id);
      const newTo = [...prev[toCol]];
      const overIdx = newTo.findIndex(r => r.threadId === over.id);
      newTo.splice(overIdx >= 0 ? overIdx : newTo.length, 0, dragged);
      return { ...prev, [fromCol]: newFrom, [toCol]: newTo };
    });
  }

  function handleDragEnd({ active, over }) {
    const endCol = findColumn(active.id);
    const originalStatus = active.data.current?.status;
    setActiveId(null);

    if (!over) {
      // Cancelled — revert to last saved order
      setLocalColumns(buildColumns(records, savedOrderRef.current));
      return;
    }

    if (endCol && endCol !== originalStatus) {
      // Cross-column drop — persist status + save new order
      onStatusChange(active.id, endCol);
      savedOrderRef.current = saveOrder(localColumns);
    } else if (endCol === originalStatus) {
      // Same-column reorder
      const items = localColumns[endCol];
      const oldIdx = items.findIndex(r => r.threadId === active.id);
      const newIdx = items.findIndex(r => r.threadId === over.id);
      if (oldIdx !== newIdx && newIdx >= 0) {
        const next = { ...localColumns, [endCol]: arrayMove(localColumns[endCol], oldIdx, newIdx) };
        savedOrderRef.current = saveOrder(next);
        setLocalColumns(next);
      } else {
        savedOrderRef.current = saveOrder(localColumns);
      }
    }
  }

  const activeRecord = useMemo(
    () => activeId ? records.find(r => r.threadId === activeId) : null,
    [activeId, records]
  );

  const cols = visibleColumns || COLUMNS;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory sm:snap-none">
        <div className="h-full min-w-full flex items-stretch sm:justify-center">
          {COLUMNS.filter(col => cols.includes(col)).map(col => (
            <KanbanColumn
              key={col}
              status={col}
              records={localColumns[col]}
              onCardClick={onCardClick}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {activeRecord && (
          <div style={{ transform: 'rotate(1.5deg)', filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.12))' }}>
            <OutreachCard
              record={activeRecord}
              onCardClick={() => {}}
              onToggleFavorite={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
