import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, RotateCcw, Sparkles, X } from "lucide-react";
import { fetchChatStatus, sendChat } from "../api";
import { Spinner } from "./ui";

/** Openers that demonstrate both halves of what the assistant can do. */
const SUGGESTIONS = [
  "What does the cross-validation score mean?",
  "Summarise my current findings",
  "Why is a site flagged Critical?",
  "How is extracted volume calculated?",
];

const GREETING =
  "I can explain how COBALT detects and measures extraction, and answer questions " +
  "about the assessments currently in your database. What would you like to know?";

/**
 * Very small markdown renderer.
 *
 * The model replies in prose with occasional **bold**, `code` and "- " bullets.
 * Pulling in a markdown library for that would be disproportionate, and
 * dangerous defaults (raw HTML) are worse than rendering plain text well.
 * Everything here is escaped by React — no dangerouslySetInnerHTML.
 */
function RichText({ text }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s, key) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
    return (
      <span key={key}>
        {parts.map((p, i) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={i} className="font-semibold text-fg">
              {p.slice(2, -2)}
            </strong>
          ) : p.startsWith("`") && p.endsWith("`") ? (
            <code
              key={i}
              className="tnum rounded bg-ink-800 px-1 py-px text-[11px] text-lime-300"
            >
              {p.slice(1, -1)}
            </code>
          ) : (
            <span key={i}>{p}</span>
          )
        )}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const isList = lines.every((l) => /^\s*[-*•]\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="space-y-1 pl-3.5">
              {lines.map((l, li) => (
                <li key={li} className="relative">
                  <span className="absolute -left-3 text-fg-faint">•</span>
                  {inline(l.replace(/^\s*[-*•]\s+/, ""), li)}
                </li>
              ))}
            </ul>
          );
        }
        return <p key={bi}>{inline(block, bi)}</p>;
      })}
    </div>
  );
}

export function Assistant() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Hide the launcher entirely unless the backend actually has a key — an
  // always-failing button is worse than no button.
  useEffect(() => {
    let alive = true;
    fetchChatStatus()
      .then((s) => alive && setEnabled(!!s.enabled))
      .catch(() => alive && setEnabled(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    async (text) => {
      const content = (text ?? draft).trim();
      if (!content || busy) return;

      const next = [...messages, { role: "user", content }];
      setMessages(next);
      setDraft("");
      setError(null);
      setBusy(true);
      try {
        const reply = await sendChat(next);
        setMessages([...next, { role: "model", content: reply }]);
      } catch (e) {
        setError(e?.message || "The assistant could not respond.");
        // Put the question back so it is not lost to a transient failure.
        setMessages(messages);
        setDraft(content);
      } finally {
        setBusy(false);
      }
    },
    [draft, busy, messages]
  );

  if (!enabled) return null;

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Ask the COBALT assistant"
          className="card-shadow fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-lime-500 px-4 py-3 text-on-accent transition-transform hover:scale-[1.03] active:scale-95"
        >
          <Sparkles size={16} strokeWidth={2.2} />
          <span className="text-[12.5px] font-semibold">Ask COBALT</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="animate-in card-shadow fixed bottom-5 right-5 z-40 flex h-[min(580px,calc(100vh-6rem))] w-[min(400px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-850">
          {/* Header */}
          <header className="flex shrink-0 items-center gap-2.5 border-b border-ink-700 px-4 py-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-lime-500 text-on-accent">
              <Bot size={15} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold leading-none text-fg">COBALT Assistant</p>
              <p className="mt-1 text-[10.5px] leading-none text-fg-mute">
                Platform &amp; your inspection data
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                title="Clear conversation"
                className="grid size-7 place-items-center rounded-md text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
              >
                <RotateCcw size={13} />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              title="Close"
              className="grid size-7 place-items-center rounded-md text-fg-mute transition-colors hover:bg-ink-800 hover:text-fg"
            >
              <X size={14} />
            </button>
          </header>

          {/* Transcript */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5">
            {messages.length === 0 && (
              <>
                <div className="rounded-xl rounded-tl-sm border border-ink-700 bg-ink-800 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-dim">
                  {GREETING}
                </div>
                <div className="space-y-1.5 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="block w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-left text-[11.5px] text-fg-dim transition-colors hover:border-lime-500/40 hover:text-fg"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl rounded-br-sm bg-lime-500 px-3 py-2 text-[12.5px] leading-relaxed text-on-accent">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div
                  key={i}
                  className="rounded-xl rounded-tl-sm border border-ink-700 bg-ink-800 px-3 py-2.5 text-[12.5px] leading-relaxed text-fg-dim"
                >
                  <RichText text={m.content} />
                </div>
              )
            )}

            {busy && (
              <div className="flex items-center gap-2 rounded-xl rounded-tl-sm border border-ink-700 bg-ink-800 px-3 py-2.5 text-[12px] text-fg-mute">
                <Spinner size={12} />
                Thinking…
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-crit-500/30 bg-crit-500/8 px-3 py-2 text-[11.5px] leading-relaxed text-crit-400">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-ink-700 p-2.5">
            <div className="flex items-end gap-2 rounded-xl border border-ink-700 bg-ink-900 px-2.5 py-2 focus-within:border-lime-500">
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                disabled={busy}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
                }}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter is a newline.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about the platform or your data…"
                className="max-h-24 flex-1 resize-none bg-transparent text-[12.5px] text-fg placeholder:text-fg-faint focus:outline-none"
              />
              <button
                onClick={() => send()}
                disabled={!draft.trim() || busy}
                title="Send"
                className="grid size-7 shrink-0 place-items-center rounded-lg bg-lime-500 text-on-accent transition-opacity disabled:opacity-35"
              >
                <ArrowUp size={14} strokeWidth={2.4} />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] leading-relaxed text-fg-mute">
              Presumptive analysis only — verify findings before acting on them.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
