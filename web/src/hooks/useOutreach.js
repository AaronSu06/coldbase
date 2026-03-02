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
      .then(data => setRecords(normalizeRecords(data)))
      .catch(e => console.error('[Reach] Failed to fetch records:', e.message));
  }, []);

  useEffect(() => {
    load();

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') load();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    const poll = setInterval(load, 5 * 60_000); // safety-net only

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(poll);
    };
  }, [load]);

  const updateStatus = useCallback((threadId, newStatus) => {
    const normalizedStatus = normalizeStatus(newStatus);
    setRecords(prev =>
      prev.map(r => r.threadId === threadId ? { ...r, status: normalizedStatus } : r)
    );
    patchOutreach(threadId, { status: normalizedStatus })
      .catch(e => console.error('[Reach] Failed to persist status update:', e.message));
  }, []);

  const toggleFavorite = useCallback((threadId) => {
    setRecords(prev => {
      const next = prev.map(r =>
        r.threadId === threadId ? { ...r, favorite: !r.favorite } : r
      );
      const record = next.find(r => r.threadId === threadId);
      if (record) {
        patchOutreach(threadId, { favorite: record.favorite })
          .catch(e => console.error('[Reach] Failed to persist favorite toggle:', e.message));
      }
      return next;
    });
  }, []);

  const toggleArchived = useCallback((threadId) => {
    setRecords(prev => {
      const next = prev.map(r =>
        r.threadId === threadId ? { ...r, archived: !r.archived } : r
      );
      const record = next.find(r => r.threadId === threadId);
      if (record) {
        patchOutreach(threadId, { archived: record.archived })
          .catch(e => console.error('[Reach] Failed to persist archived toggle:', e.message));
      }
      return next;
    });
  }, []);

  const archiveAll = useCallback((ids) => {
    const idSet = new Set(ids);
    setRecords(prev => {
      const next = prev.map(r => idSet.has(r.threadId) ? { ...r, archived: true } : r);
      ids.forEach(id => {
        patchOutreach(id, { archived: true })
          .catch(e => console.error(`[Reach] Failed to persist archive for ${id}:`, e.message));
      });
      return next;
    });
  }, []);

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
