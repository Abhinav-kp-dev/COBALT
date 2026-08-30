import { useEffect, useState } from "react";
import { Bell, Menu, Moon, RefreshCw, Sun } from "lucide-react";
import { fetchHealth } from "../api";
import { useTheme } from "../lib/theme";
import { SECTIONS } from "./Sidebar";

/** Live service indicator — polls the API root so an outage surfaces up-front. */
function ServiceStatus() {
  const [state, setState] = useState("checking");

  useEffect(() => {
    let alive = true;
    const ping = async () => {
      try {
        await fetchHealth();
        if (alive) setState("online");
      } catch {
        if (alive) setState("offline");
      }
    };
    ping();
    const t = setInterval(ping, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const map = {
    checking: { dot: "bg-fg-faint", text: "text-fg-mute", label: "Connecting" },
    online: { dot: "bg-ok-500 animate-live", text: "text-fg-mute", label: "Operational" },
    offline: { dot: "bg-crit-500", text: "text-crit-400", label: "Service offline" },
  }[state];

  return (
    <div className="flex items-center gap-2" title={`Analysis service: ${map.label}`}>
      <span className={`size-[6px] rounded-full ${map.dot}`} />
      <span className={`hidden text-[11.5px] font-medium md:inline ${map.text}`}>{map.label}</span>
    </div>
  );
}

function IconAction({ icon: Icon, onClick, title, badge }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="relative grid size-8 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-fg-mute transition-colors hover:border-ink-600 hover:text-fg"
    >
      <Icon size={14} strokeWidth={2} />
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 grid min-w-[15px] place-items-center rounded-full bg-crit-500 px-1 text-[9px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

export function Topbar({ active, onNavigate, onMenu, onRefresh, refreshing, alertCount = 0 }) {
  const { theme, toggle } = useTheme();
  const current = SECTIONS.find((s) => s.id === active);

  return (
    <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center gap-3 border-b border-ink-700 bg-ink-950/85 px-4 backdrop-blur-md lg:px-6">
      <button
        onClick={onMenu}
        title="Open menu"
        className="grid size-8 shrink-0 place-items-center rounded-lg border border-ink-700 text-fg-mute hover:text-fg lg:hidden"
      >
        <Menu size={15} />
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-[12.5px]">
          <li>
            <button
              onClick={() => onNavigate("dashboard")}
              className="text-fg-mute transition-colors hover:text-fg-dim"
            >
              COBALT
            </button>
          </li>
          <li aria-hidden className="text-fg-faint">
            /
          </li>
          <li className="truncate font-medium text-fg">{current?.label ?? "Overview"}</li>
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ServiceStatus />
        <div className="mx-1 hidden h-5 w-px bg-ink-700 sm:block" />
        <IconAction
          icon={theme === "dark" ? Sun : Moon}
          onClick={toggle}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        />
        <IconAction
          icon={RefreshCw}
          onClick={onRefresh}
          title="Refresh data"
          className={refreshing ? "animate-spin" : ""}
        />
        <IconAction
          icon={Bell}
          onClick={() => onNavigate("alerts")}
          title="Alerts"
          badge={alertCount}
        />
      </div>
    </header>
  );
}

/** Section header strip: title, supporting line, and section-level actions. */
export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg-mute">{description}</p>
        )}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
