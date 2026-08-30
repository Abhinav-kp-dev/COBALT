import { useEffect, useMemo, useState } from "react";
import {
  Box,
  ExternalLink,
  FileText,
  Globe2,
  Maximize2,
  Search,
  X,
} from "lucide-react";
import { Button, Empty, Panel, Tag, inputClass } from "../components/ui";
import { PageHeader } from "../components/Topbar";
import { Metric } from "../components/Metric";
import { useInspections } from "../lib/store";
import { useSettings } from "../lib/settings";
import { area, dateShort, nf, relativeTime, severityOf, volume } from "../lib/format";

const VIEWS = [
  { id: "3d", label: "3D Forensics", icon: Box, urlKey: "model_url" },
  { id: "map", label: "Satellite Map", icon: Globe2, urlKey: "map_url" },
  { id: "pdf", label: "Official Report", icon: FileText, urlKey: "report_url" },
];

export function Reports({ jobId, onNavigate }) {
  const { inspections, loading } = useInspections();
  const { settings } = useSettings();
  const [view, setView] = useState("3d");
  const [query, setQuery] = useState("");

  // Fall back to the newest record when the URL carries no job, or names one
  // that has since been deleted.
  const active = useMemo(() => {
    if (!inspections.length) return null;
    return inspections.find((i) => i.job_id === jobId) || inspections[0];
  }, [inspections, jobId]);

  // Keep the URL in step with whatever is actually being shown.
  useEffect(() => {
    if (active && active.job_id !== jobId) onNavigate("reports", active.job_id);
  }, [active, jobId, onNavigate]);

  // A model is only produced when there is excavated volume; if this record has
  // none, don't strand the user on an empty 3D tab.
  useEffect(() => {
    if (active && view === "3d" && !active.model_url) setView("map");
  }, [active, view]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? inspections.filter(
          (i) => i.filename?.toLowerCase().includes(q) || i.job_id?.toLowerCase().includes(q)
        )
      : inspections;
  }, [inspections, query]);

  if (!loading && inspections.length === 0) {
    return (
      <div className="animate-in">
        <PageHeader title="Reports" />
        <Panel>
          <Empty
            icon={FileText}
            title="No reports available"
            action={
              <Button variant="primary" onClick={() => onNavigate("analysis")}>
                Run an analysis
              </Button>
            }
          >
            Each completed assessment produces a 3D forensic model, an annotated satellite map and a
            signed PDF report.
          </Empty>
        </Panel>
      </div>
    );
  }

  const sev = active ? severityOf(active.illegal_area_m2, settings.alertThresholdM2) : null;
  const activeUrl = active?.[VIEWS.find((v) => v.id === view)?.urlKey];
  const a = active ? area(active.illegal_area_m2) : null;
  const v = active ? volume(active.volume_m3) : null;

  return (
    <div className="animate-in">
      <PageHeader
        title="Reports"
        description="Generated artefacts for each assessment — interactive 3D excavation model, annotated imagery, and the formal PDF."
        actions={
          activeUrl && (
            <Button
              icon={ExternalLink}
              onClick={() => window.open(activeUrl, "_blank", "noopener")}
            >
              Open in new tab
            </Button>
          )
        }
      />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Record picker */}
        <Panel
          flush
          title="Assessments"
          className="h-fit xl:max-h-[calc(100vh-190px)] xl:overflow-hidden"
        >
          <div className="border-b border-ink-700 p-2.5">
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-faint"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className={`${inputClass} h-7 pl-[26px] text-[11.5px]`}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg-dim"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <ul className="max-h-[420px] divide-y divide-ink-800 overflow-y-auto xl:max-h-[calc(100vh-262px)]">
            {list.length === 0 && (
              <li className="px-3 py-6 text-center text-[11.5px] text-fg-mute">No matches</li>
            )}
            {list.map((i) => {
              const s = severityOf(i.illegal_area_m2, settings.alertThresholdM2);
              const on = active?.job_id === i.job_id;
              return (
                <li key={i.id}>
                  <button
                    onClick={() => onNavigate("reports", i.job_id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                      on ? "bg-lime-500/[0.09]" : "hover:bg-ink-800/70"
                    }`}
                  >
                    <span
                      className={`h-8 w-[2px] shrink-0 rounded-full ${
                        on
                          ? "bg-lime-500"
                          : { ok: "bg-ok-500/50", warn: "bg-warn-500/50", crit: "bg-crit-500/50", dim: "bg-ink-600" }[
                              s.tone
                            ]
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[12px] font-medium ${on ? "text-fg" : "text-fg-dim"}`}
                      >
                        {i.filename}
                      </span>
                      <span className="tnum mt-0.5 block text-[10.5px] text-fg-mute">
                        {i.job_id} · {relativeTime(i.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Viewer */}
        <div className="min-w-0 space-y-4">
          {active && (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-[15px] font-semibold text-fg">{active.filename}</h2>
                    <Tag tone={sev.tone}>{sev.label}</Tag>
                  </div>
                  <p className="tnum mt-1 text-[11.5px] text-fg-mute">
                    Job {active.job_id} · Assessed {dateShort(active.created_at)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Metric
                  label="Deviation Area"
                  value={a.value}
                  unit={a.unit}
                  tone={active.illegal_area_m2 > 0 ? "crit" : "ok"}
                />
                <Metric label="Extracted Volume" value={v.value} unit={v.unit} />
                <Metric
                  label="Avg Pit Depth"
                  value={(Number(active.avg_depth_m) || 0).toFixed(2)}
                  unit="m"
                />
              </div>

              <Panel flush className="overflow-hidden">
                {/* View tabs */}
                <div className="flex items-center gap-0.5 border-b border-ink-700 px-2">
                  {VIEWS.map(({ id, label, icon: Icon, urlKey }) => {
                    const available = !!active[urlKey];
                    const on = view === id;
                    return (
                      <button
                        key={id}
                        onClick={() => available && setView(id)}
                        disabled={!available}
                        title={available ? label : `${label} unavailable for this assessment`}
                        className={`relative flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                          on
                            ? "border-lime-500 text-fg"
                            : "border-transparent text-fg-mute hover:text-fg-dim"
                        }`}
                      >
                        <Icon size={13} strokeWidth={2.1} className={on ? "text-lime-400" : ""} />
                        {label}
                      </button>
                    );
                  })}
                  <div className="ml-auto pr-1">
                    {activeUrl && (
                      <button
                        onClick={() => window.open(activeUrl, "_blank", "noopener")}
                        title="Open full screen"
                        className="grid size-7 place-items-center rounded text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg-dim"
                      >
                        <Maximize2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Artefact frame */}
                <div className="relative h-[600px] bg-ink-950">
                  {activeUrl ? (
                    <iframe
                      key={`${active.job_id}-${view}`}
                      src={activeUrl}
                      title={VIEWS.find((v) => v.id === view)?.label}
                      className="size-full border-0"
                    />
                  ) : (
                    <Empty
                      icon={Box}
                      title="Artefact not generated"
                    >
                      No excavation volume was detected for this lease, so no 3D model was produced.
                    </Empty>
                  )}
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
