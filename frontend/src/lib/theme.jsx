import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const KEY = "cobalt.theme.v1";

/**
 * Theme controller.
 *
 * Writes `data-theme` on <html>, which is what the whole palette in index.css
 * keys off — so a switch repaints every surface without React touching a single
 * component. Defaults to the OS preference on first visit, then respects the
 * operator's explicit choice.
 */
const ThemeCtx = createContext(null);

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* preference just won't persist */
    }
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, toggle]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
