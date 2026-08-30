import { useEffect, useRef, useState } from "react";
import {
  Bell,
  FileText,
  History,
  LayoutDashboard,
  LifeBuoy,
  ScanLine,
  Settings as SettingsIcon,
  X,
} from "lucide-react";

/** Grouped exactly as the reference: a primary work group, then system. */
export const NAV_GROUPS = [
  {
    label: "Analysis",
    items: [
      { id: "dashboard", label: "Overview", icon: LayoutDashboard },
      { id: "analysis", label: "New Analysis", icon: ScanLine },
      { id: "history", label: "Inspection History", icon: History },
      { id: "reports", label: "Reports", icon: FileText },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { id: "alerts", label: "Alerts", icon: Bell },
      { id: "settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

export const SECTIONS = NAV_GROUPS.flatMap((g) => g.items);

export function Mark({ className = "size-[26px]" }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <path
        d="M16 4.5 27 10.5v11L16 27.5 5 21.5v-11z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 14.5h11M12.2 18.2h7.6M14 21.8h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity=".62"
      />
    </svg>
  );
}

export function Sidebar({ active, onNavigate, alertCount = 0, open, onClose }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

  // ⌘K / Ctrl-K focuses search, matching the affordance advertised on the input.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();
  const groups = q
    ? NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
      })).filter((g) => g.items.length)
    : NAV_GROUPS;

  const go = (id) => {
    onNavigate(id);
    onClose?.();
  };

  return (
    <>
      {/* Scrim for the mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[236px] flex-col border-r border-ink-700 bg-ink-900 transition-transform duration-200 lg:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Brand */}
        <div className="flex h-[60px] shrink-0 items-center gap-2.5 px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lime-500 text-on-accent">
            <Mark className="size-[22px]" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[14.5px] font-bold tracking-[0.14em] text-fg">COBALT</span>
            <span className="mt-[3px] text-[8.5px] font-semibold uppercase tracking-[0.18em] text-fg-faint">
              Mining Forensics
            </span>
          </span>
          <button
            onClick={onClose}
            className="ml-auto grid size-7 place-items-center rounded-md text-fg-mute hover:bg-ink-800 hover:text-fg lg:hidden"
            title="Close menu"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-3">
          <div className="relative">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search sections"
              className="w-full rounded-lg border border-ink-700 bg-ink-800 py-1.5 pl-3 pr-11 text-[12px] text-fg placeholder:text-fg-faint focus:border-lime-500 focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-ink-600 bg-ink-750 px-1.5 py-px text-[9.5px] font-medium text-fg-mute">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Sections */}
        <nav className="scrollbar-none flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="mb-1.5 px-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-fg-faint">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map(({ id, label, icon: Icon }) => {
                  const on = active === id;
                  return (
                    <li key={id}>
                      <button
                        onClick={() => go(id)}
                        aria-current={on ? "page" : undefined}
                        className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors
                          ${
                            on
                              ? "bg-lime-500 text-on-accent"
                              : "text-fg-mute hover:bg-ink-800 hover:text-fg"
                          }`}
                      >
                        <Icon size={15} strokeWidth={2} className="shrink-0" />
                        <span className="truncate">{label}</span>
                        {id === "alerts" && alertCount > 0 && (
                          <span
                            className={`tnum ml-auto rounded-full px-1.5 py-px text-[10px] font-semibold ${
                              on
                                ? "bg-on-accent/15 text-on-accent"
                                : "bg-crit-500/15 text-crit-400"
                            }`}
                          >
                            {alertCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="px-2 py-3 text-[11.5px] text-fg-mute">No section matches “{query}”.</p>
          )}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-ink-700 px-3 py-3">
          <a
            href="https://github.com/reji-abhishek/COBALT"
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg-dim"
          >
            <LifeBuoy size={15} strokeWidth={2} />
            Documentation
          </a>
        </div>
      </aside>
    </>
  );
}
