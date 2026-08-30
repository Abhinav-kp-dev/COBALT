import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileUp,
  Layers,
  Play,
  RotateCcw,
  Satellite,
  Sigma,
  Upload,
  X,
} from "lucide-react";
import { Button, ErrorNote, Field, Panel, Tag, inputClass } from "../components/ui";
import { PageHeader } from "../components/Topbar";
import { Metric } from "../components/Metric";
import { uploadFile } from "../api";
import { useInspections } from "../lib/store";
import { useSettings } from "../lib/settings";
import { area, nf, volume } from "../lib/format";

const ACCEPTED = [".kml", ".geojson", ".json", ".zip"];

const PIPELINE = [
  { icon: Satellite, label: "Acquire Sentinel-2 composite", detail: "Cloud-filtered median over the window" },
  { icon: Layers, label: "Reconstruct pre-mining surface", detail: "Copernicus DEM focal baseline" },
  { icon: Sigma, label: "Dual-engine classification", detail: "Threshold triple-lock + RandomForest" },
  { icon: FileUp, label: "Generate artefacts", detail: "2D map, 3D model, forensic PDF" },
];

function extOf(name = "") {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

export function NewAnalysis({ onNavigate }) {
  const { refresh } = useInspections();
  const { settings } = useSettings();

  const [file, setFile] = useState(null);
  const [startDate, setStartDate] = useState(settings.defaultStartDate);
  const [endDate, setEndDate] = useState(settings.defaultEndDate);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  // Elapsed counter. The pipeline gives no progress events, so we show real
  // elapsed time rather than inventing a percentage that would be fiction.
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const accept = useCallback((f) => {
    if (!f) return;
    if (!ACCEPTED.includes(extOf(f.name))) {
      setError(`Unsupported file type "${extOf(f.name) || "unknown"}". Use ${ACCEPTED.join(", ")}.`);
      return;
    }
    setError(null);
    setResult(null);
    setFile(f);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      accept(e.dataTransfer.files?.[0]);
    },
    [accept]
  );

  const run = async () => {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadFile(file, startDate, endDate);
      setResult(res);
      await refresh();
      if (settings.autoOpenReport && res?.job_id) onNavigate("reports", res.job_id);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Analysis failed.");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const dateInvalid = startDate && endDate && startDate > endDate;

  return (
    <div className="animate-in">
      <PageHeader
        title="New Analysis"
        description="Assess a mining lease boundary against satellite imagery and elevation data to quantify extraction beyond the permitted area."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {/* Boundary input */}
          <Panel title="Lease Boundary">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`relative rounded-lg border border-dashed transition-colors ${
                dragging
                  ? "border-lime-500 bg-lime-500/[0.07]"
                  : file
                    ? "border-ink-600 bg-ink-800/50"
                    : "border-ink-600 bg-ink-900/40 hover:border-ink-600/80"
              }`}
            >
              <input
                ref={inputRef}
                id="boundary-file"
                type="file"
                className="sr-only"
                accept={ACCEPTED.join(",")}
                onChange={(e) => accept(e.target.files?.[0])}
              />

              {file ? (
                <div className="flex items-center gap-3 p-4">
                  <div className="grid size-9 shrink-0 place-items-center rounded-md border border-lime-500/30 bg-lime-500/10 text-lime-400">
                    <CheckCircle2 size={17} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg">{file.name}</p>
                    <p className="tnum mt-0.5 text-[11px] text-fg-mute">
                      {(file.size / 1024).toFixed(1)} KB · {extOf(file.name).replace(".", "").toUpperCase()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={X}
                    onClick={reset}
                    disabled={running}
                    title="Remove file"
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="boundary-file"
                  className="flex cursor-pointer flex-col items-center px-6 py-10 text-center"
                >
                  <div className="mb-3 grid size-11 place-items-center rounded-lg border border-ink-700 bg-ink-800 text-fg-mute">
                    <Upload size={19} strokeWidth={1.8} />
                  </div>
                  <p className="text-[13px] font-medium text-fg-dim">
                    Drop a boundary file, or <span className="text-lime-400">browse</span>
                  </p>
                  <p className="mt-1.5 text-[11.5px] text-fg-mute">
                    Shapefile (.zip), KML, or GeoJSON — WGS-84 polygon
                  </p>
                </label>
              )}
            </div>
          </Panel>

          {/* Acquisition window */}
          <Panel
            title="Acquisition Window"
            subtitle="Imagery is composited across this range to suppress cloud"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date">
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  disabled={running}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  disabled={running}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            {dateInvalid && (
              <p className="mt-2.5 text-[11.5px] text-crit-400">
                The start date must fall before the end date.
              </p>
            )}
          </Panel>

          {error && <ErrorNote>{error}</ErrorNote>}

          {/* Run */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              variant="primary"
              icon={running ? undefined : Play}
              onClick={run}
              disabled={!file || running || dateInvalid}
              className="min-w-[190px]"
            >
              {running ? (
                <>
                  <span className="size-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  Analysing · {elapsed}s
                </>
              ) : (
                "Run Detection"
              )}
            </Button>
            {running && (
              <p className="text-[11.5px] text-fg-mute">
                Typically 30–90 seconds. Earth Engine composites the scene server-side.
              </p>
            )}
            {!running && file && (
              <Button size="lg" variant="ghost" icon={RotateCcw} onClick={reset}>
                Reset
              </Button>
            )}
          </div>

          {/* Result */}
          {result && (
            <Panel
              title="Assessment Complete"
              className="animate-in border-lime-500/25"
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onNavigate("reports", result.job_id)}
                >
                  Open report
                  <ArrowRight size={12} />
                </Button>
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Metric
                  label="Deviation Area"
                  value={area(result.metrics?.illegal_area_m2).value}
                  unit={area(result.metrics?.illegal_area_m2).unit}
                  tone={result.metrics?.illegal_area_m2 > 0 ? "crit" : "ok"}
                />
                <Metric
                  label="Volume"
                  value={volume(result.metrics?.volume_m3).value}
                  unit={volume(result.metrics?.volume_m3).unit}
                />
                <Metric
                  label="Avg Depth"
                  value={(result.metrics?.avg_depth_m ?? 0).toFixed(2)}
                  unit="m"
                />
              </div>
              {typeof result.metrics?.agreement_pct === "number" && (
                <div className="mt-3 flex items-center gap-2.5 rounded-md border border-ink-700 bg-ink-900/60 px-3 py-2.5">
                  <Tag tone="accent">Cross-validated</Tag>
                  <p className="text-[11.5px] text-fg-mute">
                    Both detection engines independently agree on{" "}
                    <span className="tnum font-semibold text-fg-dim">
                      {result.metrics.agreement_pct}%
                    </span>{" "}
                    of the flagged area.
                  </p>
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Pipeline explainer */}
        <Panel title="Processing Pipeline" className="h-fit">
          <ol className="space-y-3.5">
            {PIPELINE.map(({ icon: Icon, label, detail }, idx) => (
              <li key={label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`grid size-7 shrink-0 place-items-center rounded-md border transition-colors ${
                      running
                        ? "border-lime-500/40 bg-lime-500/10 text-lime-400"
                        : "border-ink-700 bg-ink-800 text-fg-mute"
                    }`}
                  >
                    <Icon size={13} strokeWidth={2} />
                  </div>
                  {idx < PIPELINE.length - 1 && <div className="mt-1 w-px flex-1 bg-ink-700" />}
                </div>
                <div className="min-w-0 pb-0.5">
                  <p className="text-[12px] font-medium text-fg-dim">{label}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-fg-mute">{detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-ink-700 pt-3 text-[11px] leading-relaxed text-fg-mute">
            Findings are reported when either engine flags a pixel; the overlap between them is
            published as a cross-validation score.
          </p>
        </Panel>
      </div>
    </div>
  );
}
