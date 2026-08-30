import { useEffect } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

/* ============================================================================
   Primitives shared across sections.
   Deliberately small and unopinionated — the sections compose them.
   ========================================================================= */

/** Panel: the standard bordered surface. `flush` drops padding for tables. */
export function Panel({ title, subtitle, actions, children, flush = false, className = "" }) {
  return (
    <section
      className={`card-shadow rounded-xl border border-ink-700 bg-ink-850 ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-ink-700 px-4 py-2.5">
          <div className="min-w-0">
            {title && (
              <h2 className="truncate text-[11px] font-semibold uppercase tracking-[0.09em] text-fg-dim">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-fg-mute">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

const TONE = {
  ok: "text-ok-400 bg-ok-500/10 border-ok-500/30",
  warn: "text-warn-400 bg-warn-500/10 border-warn-500/30",
  crit: "text-crit-400 bg-crit-500/10 border-crit-500/30",
  accent: "text-lime-300 bg-lime-500/10 border-lime-500/30",
  dim: "text-fg-mute bg-ink-750 border-ink-600",
};

/** Status chip. A 5px square carries the colour so the text stays readable. */
export function Tag({ tone = "dim", children, dot = true, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TONE[tone] || TONE.dim} ${className}`}
    >
      {dot && <span className="size-[5px] shrink-0 rounded-[1px] bg-current" />}
      {children}
    </span>
  );
}

const BTN = {
  primary:
    // Lime is a light fill in both themes, so the label must be near-black —
    // white-on-lime fails contrast badly.
    "bg-lime-500 text-on-accent font-semibold hover:bg-lime-400 active:bg-lime-600 border-lime-500 disabled:hover:bg-lime-500",
  default:
    "bg-ink-750 text-fg hover:bg-ink-700 hover:border-ink-600 border-ink-700 active:bg-ink-800",
  ghost:
    "bg-transparent text-fg-dim hover:text-fg hover:bg-ink-800 border-transparent hover:border-ink-700",
  danger:
    "bg-crit-500/12 text-crit-400 hover:bg-crit-500/22 border-crit-500/35 active:bg-crit-500/30",
};

export function Button({
  variant = "default",
  size = "md",
  icon: Icon,
  children,
  className = "",
  ...props
}) {
  const sizes = {
    sm: "h-7 px-2 text-[11px] gap-1.5",
    md: "h-8 px-3 text-xs gap-2",
    lg: "h-10 px-4 text-[13px] gap-2",
  };
  return (
    <button
      className={`inline-flex select-none items-center justify-center rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${sizes[size]} ${BTN[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === "sm" ? 12 : 14} strokeWidth={2.1} className="shrink-0" />}
      {children}
    </button>
  );
}

/** Icon-only button — needs an accessible name from the caller via `title`. */
export function IconButton({ icon: Icon, variant = "ghost", className = "", ...props }) {
  return (
    <button
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${BTN[variant]} ${className}`}
      aria-label={props.title}
      {...props}
    >
      <Icon size={13} strokeWidth={2.1} />
    </button>
  );
}

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.07em] text-fg-mute">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-relaxed text-fg-mute">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs text-fg " +
  "placeholder:text-fg-faint transition-colors hover:border-ink-600 focus:border-lime-500 focus:outline-none";

/** Empty state. Never a bare "no data" — always says what to do next. */
export function Empty({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3.5 grid size-11 place-items-center rounded-lg border border-ink-700 bg-ink-800 text-fg-faint">
          <Icon size={19} strokeWidth={1.7} />
        </div>
      )}
      <p className="text-[13px] font-medium text-fg-dim">{title}</p>
      {children && (
        <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-fg-mute">{children}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 14, className = "" }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-crit-500/30 bg-crit-500/8 px-3.5 py-3">
      <AlertTriangle size={14} className="mt-px shrink-0 text-crit-400" />
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-crit-400">{children}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 text-[11px] font-medium text-fg-dim underline underline-offset-2 hover:text-fg"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmation dialog for destructive actions.
 *
 * Replaces window.confirm: that renders unstyled browser chrome, cannot show
 * what is about to be lost, and is suppressed outright in some embedded
 * contexts — which silently turns a "delete" click into a no-op.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel?.()}
    >
      <div className="animate-in w-full max-w-[400px] rounded-lg border border-ink-600 bg-ink-850 shadow-2xl shadow-black/60">
        <div className="flex gap-3 p-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-md border border-crit-500/30 bg-crit-500/10 text-crit-400">
            <AlertTriangle size={15} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
            <div className="mt-1.5 text-[12px] leading-relaxed text-fg-mute">{body}</div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-700 px-4 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner size={12} />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Skeleton block for loading states — sized by the caller. */
export function Skeleton({ className = "" }) {
  return (
    <div className={`relative overflow-hidden rounded bg-ink-800 ${className}`}>
      <div className="animate-sweep absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.045] to-transparent" />
    </div>
  );
}
