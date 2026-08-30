import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { deleteInspection, deleteInspections, fetchHistory } from "../api";

/**
 * Single source of truth for the inspection record set.
 *
 * Dashboard, History, Reports and Alerts are all views over the same list, so
 * it is fetched once here rather than per-section — otherwise deleting a run in
 * History would leave a stale copy of it on the Dashboard until a manual
 * refresh.
 */
const StoreCtx = createContext(null);

export function InspectionsProvider({ children }) {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchHistory();
      setInspections(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(e?.message || "Unable to reach the analysis service");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const removeOne = useCallback(
    async (id) => {
      await deleteInspection(id);
      // Drop locally first so the row disappears on click rather than after the
      // refetch round-trip.
      setInspections((list) => list.filter((i) => i.id !== id));
      refresh();
    },
    [refresh]
  );

  const removeMany = useCallback(
    async (ids) => {
      await deleteInspections(ids);
      const gone = new Set(ids);
      setInspections((list) => list.filter((i) => !gone.has(i.id)));
      refresh();
    },
    [refresh]
  );

  const value = useMemo(
    () => ({ inspections, loading, error, refresh, removeOne, removeMany }),
    [inspections, loading, error, refresh, removeOne, removeMany]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useInspections() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useInspections must be used inside <InspectionsProvider>");
  return ctx;
}
