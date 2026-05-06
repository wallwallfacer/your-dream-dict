"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Loader2 } from "lucide-react";
import { SpeakButton } from "@/components/SpeakButton";
import { listEntries } from "@/lib/db/notebook";
import type { SavedEntry } from "@/lib/types";
import type { LangCode } from "@/lib/languages";

export default function StoryPage() {
  const [items, setItems] = useState<SavedEntry[] | null>(null);
  const [story, setStory] = useState<{ target: string; native: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    listEntries().then(setItems).catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (!items || items.length === 0) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void generate(items);
  }, [items]);

  async function generate(saved: SavedEntry[]) {
    setLoading(true);
    setError(null);
    setStory(null);
    try {
      const from = saved[0].from;
      const to = saved[0].to;
      const terms = saved.map((s) => s.data.term);
      const res = await fetch("/api/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms, from, to }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Story failed (${res.status})`);
      }
      setStory(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write story");
    } finally {
      setLoading(false);
    }
  }

  const targetLang: LangCode | undefined = items?.[0]?.to;

  return (
    <div className="relative min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-cream/85 backdrop-blur pt-safe">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-2">
          <Link
            href="/notebook"
            className="h-10 w-10 rounded-full bg-white shadow flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wider text-ink/60">A story for you</div>
            <div className="font-semibold">Made from your saved words</div>
          </div>
          {story && targetLang && (
            <SpeakButton text={story.target} lang={targetLang} size="md" />
          )}
          <button
            type="button"
            onClick={() => items && generate(items)}
            disabled={loading || !items?.length}
            className="h-10 w-10 rounded-full bg-white shadow flex items-center justify-center disabled:opacity-50"
            aria-label="Regenerate"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 mt-3 space-y-4">
        {items && items.length === 0 && (
          <p className="rounded-3xl bg-white p-6 shadow ring-1 ring-black/5 text-ink/70">
            Save a few words first, then come back here.
          </p>
        )}
        {loading && (
          <div className="rounded-3xl bg-white p-10 shadow flex flex-col items-center gap-2 text-ink/60">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-sm">Writing something fun…</span>
          </div>
        )}
        {error && (
          <div className="rounded-3xl bg-coral text-cream p-4">
            <div className="font-bold">Story didn&apos;t come together.</div>
            <div className="mt-1 text-sm opacity-90">{error}</div>
          </div>
        )}
        {story && (
          <>
            <article className="rounded-3xl bg-white p-5 shadow ring-1 ring-black/5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">
                The story
              </h3>
              <p className="mt-2 text-lg leading-relaxed whitespace-pre-line">{story.target}</p>
            </article>
            {story.native && (
              <article className="rounded-3xl bg-cream p-5 shadow-sm ring-1 ring-black/5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">
                  Translation
                </h3>
                <p className="mt-2 leading-relaxed whitespace-pre-line text-ink/80">
                  {story.native}
                </p>
              </article>
            )}
            {items && (
              <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="text-xs font-bold uppercase tracking-wider text-ink/60 mb-2">
                  Words used
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((it) => (
                    <span
                      key={it.id}
                      className="rounded-full bg-sunshine px-2.5 py-1 text-xs font-semibold"
                    >
                      {it.data.term}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
