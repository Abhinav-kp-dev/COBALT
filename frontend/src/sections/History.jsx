import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  History as HistoryIcon,
  RefreshCw,
  ScanLine,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Empty,
  ErrorNote,
  IconButton,
  Panel,
  Skeleton,
  Tag,
  inputClass,
} from "../components/ui";
import { PageHeader } from "../components/Topbar";
import { useInspections } from "../lib/store";
import { useSettings } from "../lib/settings";
import { area, dateShort, nf, severityOf, timeShort, volume } from "../lib/format";

const COLUMNS = [
  { key: "filename", label: "Lease File", align: "left", sortable: true },
  { key: "created_at", label: "Assessed", align: "left", sortable: true },
  { key: "severity", label: "Status", align: "left", sortable: true },
  { key: "illegal_area_m2", label: "Deviation", align: "right", sortable: true },
  { key: "volume_m3", label: "Volume", align: "right", sortable: true },
  { key: "avg_depth_m", label: "Depth", align: "right", sortable: true },
];

export function History({ onNavigate }) {
  const { inspections, loading, error, refresh, removeOne, removeMany } = useInspections();
  const { settings } = useSettings();
  const threshold = settings.alertThresholdM2;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [selected, setSelected] = useState([]);
  const [pending, setPending] = useState(null); // { ids: number[] }
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? inspections.filter(
          (i) =>
            i.filename?.toLowerCase().includes(q) || i.job_id?.toLowerCase().includes(q)
        )
      : inspections;

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av;
      let bv;
      if (sort.key === "severity") {
        av = severityOf(a.illegal_area_m2, threshold).rank;
        bv = severityOf(b.illegal_area_m2, threshold).rank;
      } else if (sort.key === "filename") {
        return dir * String(a.filename || "").localeCompare(String(b.filename || ""));
      } else if (sort.key === "created_at") {
        av = new Date(a.created_at || 0).getTime();
        bv = new Date(b.created_at || 0).getTime();
      } else {
        av = Number(a[sort.key]) || 0;
        bv = Number(b[sort.key]) || 0;
      }
      return dir * (av - bv);
    });
  }, [inspections, query, sort, threshold]);

  const allOn = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () => setSelected(allOn ? [] : rows.map((r) => r.id));
  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const applySort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );

  const confirmDelete = async () => {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pending.ids.length === 1) await removeOne(pending.ids[0]);
      else await removeMany(pending.ids);
      setSelected((s) => s.filter((id) => !pending.ids.includes(id)));
      setPending(null);
    } catch (e) {
      setActionError(e?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const rowPad = settings.density === "compact" ? "py-1.5" : "py-2.5";

  return (
    <div className="animate-in">
      <PageHeader
        title="Inspection History"
        description="Every assessment COBALT has run, with its measured extraction figures and generated artefacts."
        actions={
          <>
            <Button icon={RefreshCw} onClick={refresh} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon={ScanLine} onClick={() => onNavigate("analysis")}>
              New Analysis
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote onRetry={refresh}>{error}</ErrorNote>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <ErrorNote>{actionError}</ErrorNote>
        </div>
      )}

      <Panel
        flush
        title={`${rows.length} ${rows.length === 1 ? "record" : "records"}`}
        subtitle={query ? `filtered from ${inspections.length}` : undefined}
        actions={
          <div className="relative">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by file or job ID"
              className={`${inputClass} h-7 w-[190px] pl-[26px] text-[11.5px]`}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg-dim"
                title="Clear filter"
              >
                <X size={12} />
              </button>
            )}
          </div>
        }
      >
        {/* Bulk action bar — only present when there is a selection. */}
        {selected.length > 0 && (
          <div className="flex items-center gap-3 border-b border-lime-500/25 bg-lime-500/[0.07] px-4 py-2">
            <span className="tnum text-[11.5px] font-medium text-lime-300">
              {selected.length} selected
            </span>
            <button
              onClick={() => setSelected([])}
              className="text-[11.5px] text-fg-mute underline underline-offset-2 hover:text-fg-dim"
            >
              Clear
            </button>
            <div className="ml-auto">
              <Button
                size="sm"
                variant="danger"
                icon={Trash2}
                onClick={() => setPending({ ids: [...selected] })}
              >
                Delete selected
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-px p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty
            icon={query ? Search : HistoryIcon}
            title={query ? "No matching inspections" : "No inspections recorded"}
            action={
              query ? (
                <Button onClick={() => setQuery("")}>Clear filter</Button>
              ) : (
                <Button variant="primary" icon={ScanLine} onClick={() => onNavigate("analysis")}>
                  Run first analysis
                </Button>
              )
            }
          >
            {query
              ? `Nothing matches "${query}".`
              : "Assessments appear here once you run the detection pipeline against a lease boundary."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-ink-700">
                  <th className="w-9 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={toggleAll}
                      aria-label="Select all inspections"
                      className="size-3.5 cursor-pointer accent-lime-500"
                    />
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-mute ${
                        c.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      <button
                        onClick={() => applySort(c.key)}
                        className={`inline-flex items-center gap-1 transition-colors hover:text-fg-dim ${
                          sort.key === c.key ? "text-fg-dim" : ""
                        } ${c.align === "right" ? "flex-row-reverse" : ""}`}
                      >
                        {c.label}
                        {sort.key === c.key &&
                          (sort.dir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                      </button>
                    </th>
                  ))}
                  <th className="w-16 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const sev = severityOf(i.illegal_area_m2, threshold);
                  const a = area(i.illegal_area_m2);
                  const v = volume(i.volume_m3);
                  const on = selected.includes(i.id);
                  return (
                    <tr
                      key={i.id}
                      className={`group border-b border-ink-800 transition-colors last:border-0 ${
                        on ? "bg-lime-500/[0.06]" : "hover:bg-ink-800/60"
                      }`}
                    >
                      <td className={`px-3 ${rowPad}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(i.id)}
                          aria-label={`Select ${i.filename}`}
                          className="size-3.5 cursor-pointer accent-lime-500"
                        />
                      </td>
                      <td className={`px-3 ${rowPad}`}>
                        <button
                          onClick={() => onNavigate("reports", i.job_id)}
                          className="block max-w-[240px] truncate text-left text-[12.5px] font-medium text-fg hover:text-lime-300"
                          title={i.filename}
                        >
                          {i.filename}
                        </button>
                        <span className="tnum mt-0.5 block text-[10.5px] text-fg-mute">
                          {i.job_id}
                        </span>
                      </td>
                      <td className={`px-3 ${rowPad}`}>
                        <span className="tnum block text-[12px] text-fg-dim">
                          {dateShort(i.created_at)}
                        </span>
                        <span className="tnum mt-0.5 block text-[10.5px] text-fg-mute">
                          {timeShort(i.created_at)}
                        </span>
                      </td>
                      <td className={`px-3 ${rowPad}`}>
                        <Tag tone={sev.tone}>{sev.label}</Tag>
                      </td>
                      <td className={`tnum px-3 text-right text-[12px] text-fg-dim ${rowPad}`}>
                        {a.value}
                        <span className="ml-1 text-[10px] text-fg-mute">{a.unit}</span>
                      </td>
                      <td className={`tnum px-3 text-right text-[12px] text-fg-dim ${rowPad}`}>
                        {v.value}
                        <span className="ml-1 text-[10px] text-fg-mute">{v.unit}</span>
                      </td>
                      <td className={`tnum px-3 text-right text-[12px] text-fg-dim ${rowPad}`}>
                        {(Number(i.avg_depth_m) || 0).toFixed(2)}
                        <span className="ml-1 text-[10px] text-fg-mute">m</span>
                      </td>
                      <td className={`px-3 ${rowPad}`}>
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          <IconButton
                            icon={ExternalLink}
                            title="Open report"
                            onClick={() => onNavigate("reports", i.job_id)}
                          />
                          <IconButton
                            icon={Trash2}
                            title="Delete inspection"
                            onClick={() => setPending({ ids: [i.id], name: i.filename })}
                            className="hover:!text-crit-400"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={!!pending}
        busy={busy}
        title={
          pending?.ids.length === 1
            ? "Delete this inspection?"
            : `Delete ${pending?.ids.length} inspections?`
        }
        body={
          <>
            {pending?.name ? (
              <>
                <span className="font-medium text-fg-dim">{pending.name}</span> and its generated
                report, map and 3D model will be permanently removed.
              </>
            ) : (
              "The selected records and their generated reports, maps and 3D models will be permanently removed."
            )}{" "}
            This cannot be undone.
          </>
        }
        confirmLabel={pending?.ids.length === 1 ? "Delete" : `Delete ${pending?.ids.length}`}
        onConfirm={confirmDelete}
        onCancel={() => !busy && setPending(null)}
      />
    </div>
  );
}
