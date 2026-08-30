import { useCallback, useEffect, useMemo, useState } from "react";
import { SECTIONS, Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Assistant } from "./components/Assistant";
import { Dashboard } from "./sections/Dashboard";
import { NewAnalysis } from "./sections/NewAnalysis";
import { History } from "./sections/History";
import { Reports } from "./sections/Reports";
import { Alerts } from "./sections/Alerts";
import { Settings } from "./sections/Settings";
import { InspectionsProvider, useInspections } from "./lib/store";
import { SettingsProvider, useSettings } from "./lib/settings";
import { ThemeProvider } from "./lib/theme";
import { useHashRoute } from "./lib/useHashRoute";
import { severityOf } from "./lib/format";

const VALID = new Set(SECTIONS.map((s) => s.id));

function Shell() {
  const { section, param, navigate } = useHashRoute("dashboard");
  const { inspections, refresh } = useInspections();
  const { settings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const active = VALID.has(section) ? section : "dashboard";

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [active]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Badge count: assessments at or above the reporting threshold. Uses the same
  // severity ladder as the Alerts feed, so the badge always matches the list.
  const alertCount = useMemo(
    () =>
      inspections.filter((i) => severityOf(i.illegal_area_m2, settings.alertThresholdM2).rank >= 2)
        .length,
    [inspections, settings.alertThresholdM2]
  );

  const view = {
    dashboard: <Dashboard onNavigate={navigate} />,
    analysis: <NewAnalysis onNavigate={navigate} />,
    history: <History onNavigate={navigate} />,
    reports: <Reports jobId={param} onNavigate={navigate} />,
    alerts: <Alerts onNavigate={navigate} />,
    settings: <Settings />,
  }[active];

  return (
    <div className="relative z-10 min-h-screen">
      <Sidebar
        active={active}
        onNavigate={navigate}
        alertCount={alertCount}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      {/* Offset by the fixed sidebar on desktop only. */}
      <div className="flex min-h-screen flex-col lg:pl-[236px]">
        <Topbar
          active={active}
          onNavigate={navigate}
          onMenu={() => setMenuOpen(true)}
          onRefresh={onRefresh}
          refreshing={refreshing}
          alertCount={alertCount}
        />
        <main className="mx-auto w-full max-w-[1560px] flex-1 px-4 py-5 lg:px-6">{view}</main>
        <footer className="mx-auto w-full max-w-[1560px] px-4 pb-5 lg:px-6">
          {/* fg-mute, not fg-faint: the faint tint only clears AA on a white
              panel, and the footer sits on the darker page tint. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-700 pt-3.5 text-[10.5px] text-fg-mute">
            <span>COBALT · Satellite mining forensics</span>
            <span>Sentinel-2 · Copernicus DEM · Google Earth Engine</span>
          </div>
        </footer>
      </div>

      {/* Renders nothing unless the backend has a Gemini key configured. */}
      <Assistant />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <InspectionsProvider>
          <Shell />
        </InspectionsProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}
