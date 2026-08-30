import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "cobalt.settings.v1";

/**
 * Operator preferences.
 *
 * Every key here changes real behaviour somewhere in the app — the reporting
 * threshold drives the severity ladder (and therefore the alert feed), the date
 * defaults prefill New Analysis, density resizes the history table. Nothing is
 * a decorative toggle.
 */
export const DEFAULTS = {
  /** Deviation area (m²) at or above which a finding becomes reportable. */
  alertThresholdM2: 10000,
  /** Prefilled acquisition window for a new analysis. */
  defaultStartDate: "2024-01-01",
  defaultEndDate: "2024-04-30",
  /** Jump straight to the artefacts when an analysis finishes. */
  autoOpenReport: true,
  /** Row height in the inspection table: "compact" | "comfortable". */
  density: "comfortable",
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    // Merge rather than replace, so a settings file written by an older build
    // does not leave newly-added keys undefined.
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

const SettingsCtx = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* private mode / storage disabled — preferences just won't persist */
    }
  }, [settings]);

  const set = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings({ ...DEFAULTS }), []);

  const value = useMemo(() => ({ settings, set, reset }), [settings, set, reset]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
