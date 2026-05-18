"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { LangCode } from "@/lib/languages";
import type { LookupEntry } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";

type Props = {
  entry: LookupEntry;
  query: string;
  from: LangCode;
  to: LangCode;
  forceOpen?: boolean;
  onClose?: () => void;
};

type Msg = { role: "user" | "assistant"; content: string };

export function ChatPanel({ entry, query, from, to, forceOpen, onClose }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = forceOpen ?? internalOpen;
  const close = () => {
    setInternalOpen(false);
    onClose?.();
  };
  const showFab = forceOpen === undefined;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  async function send() {
    const question = input.trim();
    if (!question || streaming) return;
    setInput("");
    const newHistory: Msg[] = [...messages, { role: "user", content: question }];
    setMessages([...newHistory, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch(withBasePath("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry,
          query,
          from,
          to,
          history: messages,
          question,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const out = prev.slice(0, -1);
          out.push({ role: "assistant", content: acc });
          return out;
        });
      }
    } catch (e) {
      console.warn("[chat] failed", e);
      setMessages((prev) => {
        const out = prev.slice(0, -1);
        out.push({ role: "assistant", content: "💔 Sorry, that failed. Try again?" });
        return out;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {showFab && (
        <button
          type="button"
          onClick={() => setInternalOpen(true)}
          className="fixed right-4 bottom-24 z-40 inline-flex items-center gap-2 rounded-full bg-berry text-cream pl-4 pr-5 py-3 shadow-2xl active:scale-95 transition"
          aria-label="Open chat"
        >
          <MessageCircle size={18} />
          <span className="text-sm font-semibold">Ask</span>
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.55 }}
              exit={{ opacity: 0 }}
              onClick={close}
              className="fixed inset-0 z-[60] bg-black"
            />
            <motion.aside
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-md rounded-t-3xl bg-cream shadow-2xl flex flex-col h-[80vh]"
            >
              <header className="flex items-center justify-between px-5 py-3 border-b border-ink/10">
                <div>
                  <div className="text-xs uppercase tracking-wider text-ink/60">
                    Ask about
                  </div>
                  <div className="font-bold text-ink truncate max-w-[16rem]">{entry.term}</div>
                </div>
                <button
                  onClick={close}
                  aria-label="Close"
                  className="h-9 w-9 rounded-full bg-white shadow flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </header>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-sm text-ink/60 py-6">
                    Ask anything — &ldquo;when do I sound rude?&rdquo;, &ldquo;is it slang?&rdquo;,
                    &ldquo;more examples please&rdquo;…
                  </div>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${
                      m.role === "user"
                        ? "bg-ink text-cream ml-auto"
                        : "bg-white text-ink shadow-sm"
                    }`}
                  >
                    {m.content || (
                      <Loader2 className="animate-spin text-ink/40" size={14} />
                    )}
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="px-3 pt-3 border-t border-ink/10 flex gap-2"
                style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a question…"
                  className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm outline-none ring-1 ring-black/5"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || streaming}
                  className="h-12 w-12 rounded-2xl bg-berry text-cream flex items-center justify-center disabled:opacity-40 active:scale-95"
                  aria-label="Send"
                >
                  {streaming ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </button>
              </form>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
