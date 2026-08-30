import { useCallback, useEffect, useMemo, useState } from "react";
import { BellOff, Check, ChevronRight, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button, Empty, Panel, Tag } from "../components/ui";
import { PageHeader } from "../components/Topbar";
import { useInspections } from "../lib/store";
import { useSettings } from "../lib/settings";
import { area, compact, relativeTime, severityOf, volume } from "../lib/format";

const ACK_KEY = "cobalt.acknowledged.v1";

function loadAcks() {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Alerts are derived, not stored.
 *
 * There is no separate alerts table in the backend — an alert *is* an
 * inspection whose deviation area crosses the operator's reporting threshold.
 * Deriving them means the feed can never drift out of sync with the underlying
 * findings, and changing the threshold in Settings re-evaluates the whole
 * history immediately.
 */
export function Alerts({ onNavigate }) {
  const { inspections, loading } = useInspections();
  const { settings } = useSettings();
  const [acked, setAcked] = useState(loadAcks);
  const [showAcked, setShowAcked] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(ACK_KEY, JSON.stringify([...acked]));
    } catch {
      /* storage unavailable — acknowledgements just won't persist */
    }
  }, [acked]);

  const ack = useCallback((jobId) => setAcked((s) => new Set(s).add(jobId)), []);
  const unack = useCallback(
    (jobId) =>
      setAcked((s) => {
        const next = new Set(s);
        next.delete(jobId);
        return next;
      }),
    []
  );

  const { open, resolved } = useMemo(() => {
    const raised = inspections
      .map((i) => ({ i, sev: severityOf(i.illegal_area_m2, settings.alertThresholdM2) }))
      .filter(({ sev }) => sev.rank >= 2)
      .sort((a, b) => b.sev.rank - a.sev.rank || new Date(b.i.created_at) - new Date(a.i.created_at));

    return {
      open: raised.filter(({ i }) => !acked.has(i.job_id)),
      resolved: raised.filter(({ i }) => acked.has(i.job_id)),
    };
  }, [inspections, settings.alertThresholdM2, acked]);

  const shown = showAcked ? resolved : open;

  const Row = ({ i, sev, isAcked }) => {
    const a = area(i.illegal_area_m2);
    const v = volume(i.volume_m3);
    return (
      <li
        className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-ink-800/50 ${
          isAcked ? "opacity-55" : ""
        }`}
      >
        <span
          className={`mt-1 h-9 w-[2px] shrink-0 rounded-full ${
            sev.tone === "crit" ? "bg-crit-500" : "bg-warn-500"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={sev.tone}>{sev.label}</Tag>
            <button
              onClick={() => onNavigate("reports", i.job_id)}
              className="truncate text-[12.5px] font-medium text-fg hover:text-lime-300"
            >
              {i.filename}
            </button>
            <span className="tnum text-[10.5px] text-fg-mute">{relativeTime(i.created_at)}</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-mute">
            {sev.blurb} Measured deviation{" "}
            <span className="tnum font-medium text-fg-dim">
              {a.value} {a.unit}
            </span>{" "}
            with{" "}
            <span className="tnum font-medium text-fg-dim">
              {v.value} {v.unit}
            </span>{" "}
            of material removed.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isAcked ? (
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => unack(i.job_id)}>
              Reopen
            </Button>
          ) : (
            <Button size="sm" variant="ghost" icon={Check} onClick={() => ack(i.job_id)}>
              Acknowledge
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onNavigate("reports", i.job_id)}>
            <ChevronRight size={13} />
          </Button>
        </div>
      </li>
    );
  };

  return (
    <div className="animate-in">
      <PageHeader
        title="Alerts"
        description={`Assessments whose deviation area meets or exceeds the ${compact(
          settings.alertThresholdM2
        )} m² reporting threshold.`}
        actions={
          <Button icon={SlidersHorizontal} onClick={() => onNavigate("settings")}>
            Adjust threshold
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-1">
        {[
          { id: false, label: "Open", count: open.length },
          { id: true, label: "Acknowledged", count: resolved.length },
        ].map((t) => (
          <button
            key={String(t.id)}
            onClick={() => setShowAcked(t.id)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              showAcked === t.id
                ? "border-ink-600 bg-ink-750 text-fg"
                : "border-transparent text-fg-mute hover:text-fg-dim"
            }`}
          >
            {t.label}
            <span className="tnum rounded bg-ink-800 px-1.5 py-px text-[10.5px] text-fg-mute">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <Panel flush>
        {loading ? (
          <p className="px-4 py-8 text-center text-[12px] text-fg-mute">Loading assessments…</p>
        ) : shown.length === 0 ? (
          <Empty
            icon={showAcked ? BellOff : ShieldCheck}
            title={showAcked ? "Nothing acknowledged yet" : "No open alerts"}
          >
            {showAcked
              ? "Alerts you acknowledge are archived here for audit."
              : inspections.length === 0
                ? "Alerts are raised automatically once assessments have been run."
                : `No assessment currently exceeds the ${compact(settings.alertThresholdM2)} m² threshold. Lower it in Settings to widen the net.`}
          </Empty>
        ) : (
          <ul className="divide-y divide-ink-800">
            {shown.map(({ i, sev }) => (
              <Row key={i.id} i={i} sev={sev} isAcked={showAcked} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
