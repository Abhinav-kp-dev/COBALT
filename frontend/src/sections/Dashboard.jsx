import { useMemo } from "react";
import {
  ArrowUpRight,
  Boxes,
  Radar,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Metric } from "../components/Metric";
import { Button, Empty, ErrorNote, Panel, Skeleton, Tag } from "../components/ui";
import { PageHeader } from "../components/Topbar";
import { useInspections } from "../lib/store";
import { useSettings } from "../lib/settings";
import { SEVERITY, area, compact, nf, relativeTime, severityOf, volume } from "../lib/format";

const BAR = { ok: "bg-ok-500", warn: "bg-warn-500", crit: "bg-crit-500", dim: "bg-ink-600" };
const TXT = { ok: "text-ok-400", warn: "text-warn-400", crit: "text-crit-400", dim: "text-fg-mute" };

/* Severity donut — pure SVG; no chart dependency for four numbers. */
function Donut({ counts, total }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const stroke = {
    critical: "var(--cb-crit)",
    elevated: "var(--cb-warn)",
    low: "var(--cb-600)",
    clear: "var(--cb-ok)",
  };

  let offset = 0;
  const arcs = ["critical", "elevated", "low", "clear"]
    .filter((k) => counts[k] > 0)
    .map((k) => {
      const dash = (counts[k] / total) * C;
      const seg = { k, dash, offset };
      offset += dash;
      return seg;
    });

  return (
    <div className="relative grid size-[150px] shrink-0 place-items-center">
      <svg viewBox="0 0 140 140" className="size-full -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--cb-800)" strokeWidth="17" />
        {arcs.map((a) => (
          <circle
            key={a.k}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={stroke[a.k]}
            strokeWidth="17"
            strokeDasharray={`${a.dash} ${C - a.dash}`}
            strokeDashoffset={-a.offset}
          />
        ))}
      </svg>
      <div className="absolute grid place-items-center text-center">
        <span className="tnum text-[26px] font-semibold leading-none text-fg">{total}</span>
        <span className="mt-1 text-[10.5px] text-fg-mute">Assessments</span>
      </div>
    </div>
  );
}

export function Dashboard({ onNavigate }) {
  const { inspections, loading, error, refresh } = useInspections();
  const { settings } = useSettings();
  const threshold = settings.alertThresholdM2;

  const stats = useMemo(() => {
    const counts = { clear: 0, low: 0, elevated: 0, critical: 0 };
    let deviationArea = 0;
    let extracted = 0;
    let deepest = 0;

    for (const i of inspections) {
      counts[severityOf(i.illegal_area_m2, threshold).key] += 1;
      deviationArea += Number(i.illegal_area_m2) || 0;
      extracted += Number(i.volume_m3) || 0;
      deepest = Math.max(deepest, Number(i.avg_depth_m) || 0);
    }

    // A lease can be re-assessed, so these totals are cumulative across runs
    // rather than a unique ground-area figure — labelled as such below.
    const distinctLeases = new Set(inspections.map((i) => i.filename)).size;

    return {
      counts,
      deviationArea,
      extracted,
      deepest,
      distinctLeases,
      flagged: counts.elevated + counts.critical,
      total: inspections.length,
    };
  }, [inspections, threshold]);

  const devArea = area(stats.deviationArea);
  const vol = volume(stats.extracted);
  const recent = inspections.slice(0, 6);
  const worst = useMemo(
    () => [...inspections].sort((a, b) => (b.volume_m3 || 0) - (a.volume_m3 || 0)).slice(0, 5),
    [inspections]
  );

  if (error) {
    return (
      <>
        <PageHeader title="Overview" />
        <ErrorNote onRetry={refresh}>{error}</ErrorNote>
      </>
    );
  }

  return (
    <div className="animate-in">
      <PageHeader
        title="Overview"
        description="Aggregate extraction position across every lease COBALT has assessed."
        actions={
          <Button variant="primary" icon={ScanLine} onClick={() => onNavigate("analysis")}>
            New Analysis
          </Button>
        }
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ------------------------------------------------ primary column */}
        <div className="min-w-0 space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[92px]" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric
                label="Deviation Area"
                value={devArea.value}
                unit={devArea.unit}
                icon={ScanLine}
                tone={stats.deviationArea > 0 ? "warn" : "ok"}
                footnote="Cumulative, outside boundaries"
              />
              <Metric
                label="Extracted Volume"
                value={vol.value}
                unit={vol.unit}
                icon={Boxes}
                tone="accent"
                footnote="Unauthorised, all assessments"
              />
              <Metric
                label="Requiring Review"
                value={nf(stats.flagged)}
                unit={`of ${stats.total}`}
                icon={Radar}
                tone={stats.flagged ? "crit" : "ok"}
                footnote={`At or above ${compact(threshold)} m²`}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Panel title="Severity Distribution" subtitle="Across all assessments">
              {stats.total === 0 ? (
                <p className="py-10 text-center text-[12px] text-fg-mute">
                  Awaiting first assessment
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-5">
                  <Donut counts={stats.counts} total={stats.total} />
                  <ul className="grid min-w-[150px] flex-1 grid-cols-2 gap-x-4 gap-y-3">
                    {["critical", "elevated", "low", "clear"].map((k) => {
                      const s = SEVERITY[k];
                      return (
                        <li key={k}>
                          <div className="flex items-center gap-1.5">
                            <span className={`size-[7px] rounded-[2px] ${BAR[s.tone]}`} />
                            <span className="text-[11px] text-fg-mute">{s.label}</span>
                          </div>
                          <span
                            className={`tnum mt-0.5 block text-[17px] font-semibold ${TXT[s.tone]}`}
                          >
                            {stats.counts[k]}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Panel>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Metric
                  label="Leases Covered"
                  value={nf(stats.distinctLeases)}
                  unit="files"
                  footnote={`${stats.total} total runs`}
                />
                <Metric
                  label="Deepest Mean Pit"
                  value={stats.deepest.toFixed(2)}
                  unit="m"
                  footnote="Highest site average"
                />
              </div>

              <Panel className="relative overflow-hidden !border-lime-500/30">
                <div className="pointer-events-none absolute -right-8 -top-8 size-28 rounded-full bg-lime-500/10 blur-2xl" />
                <div className="relative flex items-start gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-lime-500 text-on-accent">
                    <ShieldCheck size={15} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-fg">Dual-verified ensemble</p>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-mute">
                      Every scene is assessed twice — a physics-based threshold triple-lock and a
                      RandomForest classifier — on an identical pixel grid. Overlap is published as
                      a cross-validation score.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Tag tone="accent" dot={false}>NDBI · NDVI · Depth</Tag>
                      <Tag tone="accent" dot={false}>RF · 500 trees</Tag>
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
          </div>

          <Panel
            title="Recent Inspections"
            subtitle={stats.total ? `${stats.total} on record` : undefined}
            flush
            actions={
              inspections.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => onNavigate("history")}>
                  View all
                  <ArrowUpRight size={12} />
                </Button>
              )
            }
          >
            {loading ? (
              <div className="space-y-px p-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <Empty
                icon={ScanLine}
                title="No inspections yet"
                action={
                  <Button variant="primary" icon={ScanLine} onClick={() => onNavigate("analysis")}>
                    Run first analysis
                  </Button>
                }
              >
                Upload a lease boundary to run the detection pipeline against Sentinel-2 imagery and
                Copernicus elevation data.
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-ink-700 text-[10px] uppercase tracking-[0.08em] text-fg-mute">
                      <th className="px-4 py-2 text-left font-semibold">Lease</th>
                      <th className="px-3 py-2 text-right font-semibold">Deviation</th>
                      <th className="px-3 py-2 text-right font-semibold">Volume</th>
                      <th className="px-4 py-2 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((i) => {
                      const sev = severityOf(i.illegal_area_m2, threshold);
                      const a = area(i.illegal_area_m2);
                      const v = volume(i.volume_m3);
                      return (
                        <tr
                          key={i.id}
                          onClick={() => onNavigate("reports", i.job_id)}
                          className="cursor-pointer border-b border-ink-800 transition-colors last:border-0 hover:bg-ink-800/60"
                        >
                          <td className="px-4 py-2.5">
                            <span className="flex items-center gap-2.5">
                              <span
                                className={`h-7 w-[2px] shrink-0 rounded-full ${BAR[sev.tone]}`}
                              />
                              <span className="min-w-0">
                                <span className="block max-w-[220px] truncate text-[12.5px] font-medium text-fg">
                                  {i.filename}
                                </span>
                                <span className="tnum mt-0.5 block text-[10.5px] text-fg-mute">
                                  {i.job_id} · {relativeTime(i.created_at)}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className="tnum px-3 py-2.5 text-right text-[12px] text-fg-dim">
                            {a.value}
                            <span className="ml-1 text-[10px] text-fg-mute">{a.unit}</span>
                          </td>
                          <td className="tnum px-3 py-2.5 text-right text-[12px] text-fg-dim">
                            {v.value}
                            <span className="ml-1 text-[10px] text-fg-mute">{v.unit}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Tag tone={sev.tone}>{sev.label}</Tag>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ---------------------------------------------------- right rail */}
        <div className="space-y-4">
          <Panel title="Largest Extractions" subtitle="By unauthorised volume" flush>
            {worst.length === 0 ? (
              <p className="px-4 py-8 text-center text-[11.5px] text-fg-mute">No data yet</p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {worst.map((i, idx) => {
                  const v = volume(i.volume_m3);
                  const pct = stats.extracted ? ((i.volume_m3 || 0) / stats.extracted) * 100 : 0;
                  return (
                    <li key={i.id}>
                      <button
                        onClick={() => onNavigate("reports", i.job_id)}
                        className="w-full px-4 py-2.5 text-left transition-colors hover:bg-ink-800/60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="tnum w-4 shrink-0 text-[10.5px] font-semibold text-fg-faint">
                            {idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">
                            {i.filename}
                          </span>
                          <span className="tnum shrink-0 text-[11.5px] text-fg-dim">
                            {v.value}
                            <span className="ml-0.5 text-[9.5px] text-fg-mute">{v.unit}</span>
                          </span>
                        </div>
                        <div className="ml-6 mt-1.5 h-1 overflow-hidden rounded-full bg-ink-800">
                          <div
                            className="h-full rounded-full bg-lime-500"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Open Alerts"
            flush
            actions={
              stats.flagged > 0 && (
                <Button size="sm" variant="ghost" onClick={() => onNavigate("alerts")}>
                  All
                  <ArrowUpRight size={11} />
                </Button>
              )
            }
          >
            {stats.flagged === 0 ? (
              <div className="px-4 py-7 text-center">
                <ShieldCheck size={19} className="mx-auto mb-2 text-ok-500" />
                <p className="text-[11.5px] text-fg-mute">
                  Nothing above the {compact(threshold)} m² threshold
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-800">
                {inspections
                  .filter((i) => severityOf(i.illegal_area_m2, threshold).rank >= 2)
                  .slice(0, 4)
                  .map((i) => {
                    const sev = severityOf(i.illegal_area_m2, threshold);
                    return (
                      <li key={i.id}>
                        <button
                          onClick={() => onNavigate("reports", i.job_id)}
                          className="flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-ink-800/60"
                        >
                          <span
                            className={`mt-1 size-[7px] shrink-0 rounded-full ${BAR[sev.tone]}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium text-fg">
                              {i.filename}
                            </span>
                            <span className="mt-0.5 block text-[10.5px] text-fg-mute">
                              {sev.label} · {relativeTime(i.created_at)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Panel>

          {/* Replaces the reference's pricing promo with the action that
              actually matters in this product. */}
          <div className="card-shadow relative overflow-hidden rounded-xl border border-lime-500/30 bg-gradient-to-br from-lime-500/20 via-lime-500/[0.07] to-transparent p-4">
            <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-lime-500/20 blur-2xl" />
            <div className="relative">
              <Tag tone="accent" dot={false} className="mb-2.5">
                <Sparkles size={10} /> Assess a lease
              </Tag>
              <p className="text-[13px] font-semibold leading-snug text-fg">
                Quantify extraction beyond a permitted boundary
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-mute">
                Upload a KML, GeoJSON or shapefile — COBALT returns area, volume, depth and a signed
                forensic report.
              </p>
              <Button
                variant="primary"
                className="mt-3 w-full"
                icon={ScanLine}
                onClick={() => onNavigate("analysis")}
              >
                Start analysis
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
