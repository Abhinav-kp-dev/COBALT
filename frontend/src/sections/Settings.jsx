import { useEffect, useState } from "react";
import { Activity, Database, RotateCcw, Server, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button, ConfirmDialog, Field, Panel, Tag, inputClass } from "../components/ui";
import { PageHeader } from "../components/Topbar";
import { API_URL, fetchHealth } from "../api";
import { useInspections } from "../lib/store";
import { DEFAULTS, useSettings } from "../lib/settings";
import { compact, nf } from "../lib/format";

/** Static description of the server-side detection constants, for provenance. */
const PIPELINE_PARAMS = [
  { label: "Optical gate (NDBI)", value: "> 0.15", note: "Bare-soil signature" },
  { label: "Vegetation gate (NDVI)", value: "< 0.20", note: "Absence of canopy" },
  { label: "Minimum pit depth", value: "2.0 m", note: "Against reconstructed surface" },
  { label: "Classifier confidence", value: "P ≥ 0.99", note: "RandomForest, 500 trees" },
  { label: "Elevation source", value: "COPERNICUS GLO-30", note: "2024 release" },
  { label: "Imagery source", value: "Sentinel-2 SR", note: "Cloud < 20%" },
];

export function Settings() {
  const { settings, set, reset } = useSettings();
  const { inspections, removeMany } = useInspections();
  const [health, setHealth] = useState({ state: "checking", data: null });
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchHealth()
      .then((d) => alive && setHealth({ state: "online", data: d }))
      .catch(() => alive && setHealth({ state: "offline", data: null }));
    return () => {
      alive = false;
    };
  }, []);

  const purgeAll = async () => {
    setPurging(true);
    try {
      await removeMany(inspections.map((i) => i.id));
      setConfirmPurge(false);
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="animate-in max-w-[1100px]">
      <PageHeader
        title="Settings"
        description="Operator preferences are stored in this browser. Detection constants are fixed server-side and shown here for provenance."
        actions={
          <Button icon={RotateCcw} onClick={reset}>
            Restore defaults
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Reporting threshold */}
        <Panel title="Reporting Threshold" subtitle="Drives severity, alerts and dashboard counts">
          <Field
            label="Deviation area threshold"
            hint="A finding at or above this area is reported as Elevated; ten times this value escalates it to Critical. Changing it re-evaluates the entire inspection history immediately."
          >
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={500}
                value={settings.alertThresholdM2}
                onChange={(e) =>
                  set({ alertThresholdM2: Math.max(0, Number(e.target.value) || 0) })
                }
                className={`${inputClass} tnum max-w-[180px]`}
              />
              <span className="text-[11.5px] text-fg-mute">m²</span>
            </div>
          </Field>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[1000, 5000, 10000, 50000].map((v) => (
              <button
                key={v}
                onClick={() => set({ alertThresholdM2: v })}
                className={`tnum rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                  settings.alertThresholdM2 === v
                    ? "border-lime-500/50 bg-lime-500/12 text-lime-300"
                    : "border-ink-700 bg-ink-800 text-fg-mute hover:text-fg-dim"
                }`}
              >
                {compact(v)} m²
              </button>
            ))}
          </div>
        </Panel>

        {/* Analysis defaults */}
        <Panel title="Analysis Defaults" subtitle="Prefilled when starting a new assessment">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default start">
              <input
                type="date"
                value={settings.defaultStartDate}
                onChange={(e) => set({ defaultStartDate: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Default end">
              <input
                type="date"
                value={settings.defaultEndDate}
                onChange={(e) => set({ defaultEndDate: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="mt-4 space-y-2.5 border-t border-ink-700 pt-3.5">
            <Toggle
              label="Open report when analysis completes"
              description="Jump straight to the generated artefacts."
              checked={settings.autoOpenReport}
              onChange={(v) => set({ autoOpenReport: v })}
            />
            <Toggle
              label="Compact table rows"
              description="Fit more inspections on screen at once."
              checked={settings.density === "compact"}
              onChange={(v) => set({ density: v ? "compact" : "comfortable" })}
            />
          </div>
        </Panel>

        {/* Detection constants */}
        <Panel
          title="Detection Parameters"
          subtitle="Server-side constants — read only"
          actions={<Tag tone="accent" dot={false}>Dual-verified</Tag>}
        >
          <dl className="divide-y divide-ink-800">
            {PIPELINE_PARAMS.map((p) => (
              <div key={p.label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <dt className="min-w-0">
                  <span className="block truncate text-[12px] text-fg-dim">{p.label}</span>
                  <span className="block truncate text-[10.5px] text-fg-mute">{p.note}</span>
                </dt>
                <dd className="tnum shrink-0 text-[12px] font-medium text-fg">{p.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {/* System + data */}
        <div className="space-y-4">
          <Panel title="System Status">
            <div className="space-y-2.5">
              <StatusRow
                icon={Server}
                label="Analysis service"
                value={
                  health.state === "checking"
                    ? "Checking…"
                    : health.state === "online"
                      ? "Operational"
                      : "Unreachable"
                }
                tone={health.state === "online" ? "ok" : health.state === "offline" ? "crit" : "dim"}
              />
              <StatusRow icon={Activity} label="Endpoint" value={API_URL} mono />
              <StatusRow
                icon={Database}
                label="Stored inspections"
                value={nf(inspections.length)}
                mono
              />
            </div>
          </Panel>

          <Panel title="Data Management">
            <p className="text-[11.5px] leading-relaxed text-fg-mute">
              Removes every inspection record along with its generated report, map and 3D model from
              the server. Intended for clearing demonstration data.
            </p>
            <div className="mt-3">
              <Button
                variant="danger"
                icon={Trash2}
                disabled={inspections.length === 0}
                onClick={() => setConfirmPurge(true)}
              >
                Delete all {inspections.length > 0 ? `(${inspections.length})` : ""}
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      <p className="mt-5 flex items-center gap-1.5 text-[11px] text-fg-faint">
        <SlidersHorizontal size={11} />
        Preferences persist in this browser only. Defaults: threshold {compact(
          DEFAULTS.alertThresholdM2
        )} m², window {DEFAULTS.defaultStartDate} → {DEFAULTS.defaultEndDate}.
      </p>

      <ConfirmDialog
        open={confirmPurge}
        busy={purging}
        title={`Delete all ${inspections.length} inspections?`}
        body="Every record and all generated artefacts will be permanently removed from the server. This cannot be undone."
        confirmLabel={`Delete all ${inspections.length}`}
        onConfirm={purgeAll}
        onCancel={() => !purging && setConfirmPurge(false)}
      />
    </div>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-[18px] w-[32px] shrink-0 rounded-full border transition-colors ${
          checked ? "border-lime-500 bg-lime-500/85" : "border-ink-600 bg-ink-750"
        }`}
      >
        <span
          className={`block size-3 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[15px]" : "translate-x-[2px]"
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-[12px] text-fg-dim">{label}</span>
        <span className="block text-[11px] text-fg-mute">{description}</span>
      </span>
    </label>
  );
}

function StatusRow({ icon: Icon, label, value, tone = "dim", mono = false }) {
  const toneClass = { ok: "text-ok-400", crit: "text-crit-400", dim: "text-fg-dim" }[tone];
  return (
    <div className="flex items-center gap-2.5">
      <Icon size={13} className="shrink-0 text-fg-faint" />
      <span className="flex-1 text-[12px] text-fg-mute">{label}</span>
      <span className={`truncate text-[11.5px] font-medium ${mono ? "tnum" : ""} ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}
