import { useState, useEffect, useCallback } from 'react';
import { fetchOutreach, patchOutreach, deleteOutreach } from '../lib/api';
import { COLUMNS } from '@shared/constants';

function normalizeStatus(status) {
  if (status === 'Applied') return 'Sent';
  return COLUMNS.includes(status) ? status : 'Sent';
}

function normalizeRecords(records) {
  return records.map(record => {
    const normalizedStatus = normalizeStatus(record.status);
    return normalizedStatus === record.status
      ? record
      : { ...record, status: normalizedStatus };
  });
}

export function useOutreach() {
  const [records, setRecords] = useState([]);

  const load = useCallback(() => {
    fetchOutreach()
      .then(({ data }) => setRecords(normalizeRecords(data)))
      .catch(e => console.error('[Reach] Failed to fetch records:', e.message));
  }, []);

  useEffect(() => {
    load();

    const poll = setInterval(load, 5 * 60_000); // safety-net only

    return () => {
      clearInterval(poll);
    };
  }, [load]);

  const persistPatch = useCallback((threadId, patch, context) => {
    patchOutreach(threadId, patch)
      .catch(e => console.error(`[Reach] Failed to persist ${context}:`, e.message));
  }, []);

  const applyOptimisticMutation = useCallback((threadId, mutate, toPatch, context) => {
    setRecords(prev => {
      let patch = null;
      const next = prev.map(r => {
        if (r.threadId !== threadId) return r;
        const updated = mutate(r);
        patch = toPatch(updated);
        return updated;
      });
      if (patch) persistPatch(threadId, patch, context);
      return next;
    });
  }, [persistPatch]);

  const updateStatus = useCallback((threadId, newStatus) => {
    const normalizedStatus = normalizeStatus(newStatus);
    applyOptimisticMutation(
      threadId,
      (record) => ({ ...record, status: normalizedStatus }),
      () => ({ status: normalizedStatus }),
      'status update'
    );
  }, [applyOptimisticMutation]);

  const toggleFavorite = useCallback((threadId) => {
    applyOptimisticMutation(
      threadId,
      (record) => ({ ...record, favorite: !record.favorite }),
      (updated) => ({ favorite: updated.favorite }),
      'favorite toggle'
    );
  }, [applyOptimisticMutation]);

  const toggleArchived = useCallback((threadId) => {
    applyOptimisticMutation(
      threadId,
      (record) => ({ ...record, archived: !record.archived }),
      (updated) => ({ archived: updated.archived }),
      'archived toggle'
    );
  }, [applyOptimisticMutation]);

  const archiveAll = useCallback((ids) => {
    const idSet = new Set(ids);
    setRecords(prev => {
      const next = prev.map(r => idSet.has(r.threadId) ? { ...r, archived: true } : r);
      ids.forEach(id => {
        persistPatch(id, { archived: true }, `archive for ${id}`);
      });
      return next;
    });
  }, [persistPatch]);

  const updateRecord = useCallback((threadId, patch) => {
    let previousValues = null;
    setRecords(prev =>
      prev.map(r => {
        if (r.threadId !== threadId) return r;
        previousValues = Object.fromEntries(
          Object.keys(patch).map((key) => [key, r[key]])
        );
        return { ...r, ...patch };
      })
    );
    patchOutreach(threadId, patch).catch(e => {
      console.error('[Reach] Failed to persist record update:', e.message);
      if (!previousValues) return;
      setRecords(prev =>
        prev.map(r => r.threadId === threadId ? { ...r, ...previousValues } : r)
      );
    });
  }, []);

  const deleteRecord = useCallback((threadId) => {
    setRecords(prev => prev.filter(r => r.threadId !== threadId));
    deleteOutreach(threadId);
  }, []);

  return { records, refresh: load, updateStatus, toggleFavorite, toggleArchived, archiveAll, updateRecord, deleteRecord };
}
