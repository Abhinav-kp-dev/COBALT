import { useCallback, useEffect, useState } from "react";

/**
 * Minimal hash router.
 *
 * Sections get real, shareable URLs (#/history, #/reports/4c9f) without pulling
 * in a routing dependency — and the back button works, which matters once an
 * operator is three inspections deep into a review.
 */
export function useHashRoute(fallback = "dashboard") {
  const read = useCallback(() => {
    const raw = window.location.hash.replace(/^#\/?/, "").trim();
    if (!raw) return { section: fallback, param: null };
    const [section, param] = raw.split("/");
    return { section: section || fallback, param: param || null };
  }, [fallback]);

  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, [read]);

  const navigate = useCallback((section, param) => {
    window.location.hash = param ? `/${section}/${param}` : `/${section}`;
  }, []);

  return { ...route, navigate };
}
