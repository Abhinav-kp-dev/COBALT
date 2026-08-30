// Presentation helpers. Every figure in COBALT is comparative — a volume next
// to another volume, an area against a threshold — so formatting is centralised
// here to keep units and precision consistent across sections.

export const nf = (n, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

/** Compact figures for tiles, where column width is tight. */
export function compact(n) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return nf(n);
}

/** m² is unreadable past a few hectares; switch units rather than add digits. */
export function area(m2) {
  if (!Number.isFinite(m2)) return { value: "—", unit: "" };
  if (m2 >= 1e6) return { value: (m2 / 1e6).toFixed(2), unit: "km²" };
  if (m2 >= 1e4) return { value: (m2 / 1e4).toFixed(2), unit: "ha" };
  return { value: nf(m2), unit: "m²" };
}

export function volume(m3) {
  if (!Number.isFinite(m3)) return { value: "—", unit: "" };
  if (m3 >= 1e6) return { value: (m3 / 1e6).toFixed(2), unit: "Mm³" };
  return { value: compact(m3), unit: "m³" };
}

export const dateShort = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export const timeShort = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export function relativeTime(iso) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 1) return "just now";
  if (Math.abs(min) < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (Math.abs(d) < 30) return `${d}d ago`;
  return dateShort(iso);
}

/**
 * Severity ladder. `threshold` is the operator-configured area (m²) at which a
 * deviation becomes reportable — everything below it is noise, everything well
 * above it is an escalation. Kept as one function so the table, the dashboard
 * and the alert feed can never disagree about what "critical" means.
 */
export function severityOf(illegalAreaM2, threshold) {
  const a = Number(illegalAreaM2) || 0;
  if (a <= 0) return SEVERITY.clear;
  if (a < threshold) return SEVERITY.low;
  if (a < threshold * 10) return SEVERITY.elevated;
  return SEVERITY.critical;
}

export const SEVERITY = {
  clear: {
    key: "clear",
    label: "Clear",
    tone: "ok",
    rank: 0,
    blurb: "No extraction detected outside the lease boundary.",
  },
  low: {
    key: "low",
    label: "Low",
    tone: "dim",
    rank: 1,
    blurb: "Deviation detected below the reporting threshold.",
  },
  elevated: {
    key: "elevated",
    label: "Elevated",
    tone: "warn",
    rank: 2,
    blurb: "Deviation exceeds the reporting threshold. Review advised.",
  },
  critical: {
    key: "critical",
    label: "Critical",
    tone: "crit",
    rank: 3,
    blurb: "Deviation an order of magnitude over threshold. Escalate.",
  },
};
