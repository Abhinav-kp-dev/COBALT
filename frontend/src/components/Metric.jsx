/**
 * Metric tile.
 *
 * Label sits above a monospaced figure with the unit demoted to a suffix, so a
 * row of tiles reads as a column of comparable numbers rather than a row of
 * sentences. The optional left rule is the only colour — it encodes state.
 */
const RULE = {
  none: "",
  accent: "before:bg-lime-500",
  ok: "before:bg-ok-500",
  warn: "before:bg-warn-500",
  crit: "before:bg-crit-500",
};

export function Metric({
  label,
  value,
  unit,
  footnote,
  icon: Icon,
  tone = "none",
  className = "",
}) {
  return (
    <div
      className={`relative overflow-hidden card-shadow rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3
        ${tone !== "none" ? `before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-[''] ${RULE[tone]}` : ""}
        ${className}`}
    >
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={12} strokeWidth={2} className="shrink-0 text-fg-faint" />}
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.09em] text-fg-mute">
          {label}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className="tnum text-[21px] font-semibold leading-none tracking-tight text-fg">
          {value}
        </span>
        {unit && <span className="text-[11px] font-medium text-fg-mute">{unit}</span>}
      </div>
      {footnote && <p className="mt-1.5 truncate text-[11px] text-fg-mute">{footnote}</p>}
    </div>
  );
}

/**
 * Horizontal proportion bar — used for the severity mix on the dashboard.
 * Segments carry a title so the exact counts are available on hover.
 */
export function SegmentBar({ segments, total }) {
  if (!total) return <div className="h-1.5 w-full rounded-full bg-ink-750" />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink-750">
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.key}
            className={s.className}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
    </div>
  );
}
