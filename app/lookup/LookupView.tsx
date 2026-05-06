"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Heart, Loader2 } from "lucide-react";
import { EntryCard } from "@/components/EntryCard";
import { ExampleSentence } from "@/components/ExampleSentence";
import { UsageNotes } from "@/components/UsageNotes";
import { ChatPanel } from "@/components/ChatPanel";
import type { LangCode } from "@/lib/languages";
import type { LookupEntry, SavedEntry } from "@/lib/types";
import { entryId, getEntry, saveEntry, deleteEntry } from "@/lib/db/notebook";
import { prewarmAudio, headlineTtsText } from "@/lib/audio";
import { useFeedStore } from "@/lib/feedStore";

export default function LookupView() {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const from = (params.get("from") as LangCode) || "zh";
  const to = (params.get("to") as LangCode) || "en";

  const id = useMemo(() => entryId(query, from, to), [query, from, to]);

  const [entry, setEntry] = useState<LookupEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const lookupStartedRef = useRef(false);

  useEffect(() => {
    if (!query) {
      router.replace("/");
      return;
    }
    if (lookupStartedRef.current) return;
    lookupStartedRef.current = true;

    (async () => {
      // 1) Saved entries — IndexedDB.
      const existing = await getEntry(id).catch(() => undefined);
      if (existing) {
        setEntry(existing.data);
        setSaved(true);
        prewarmAll(existing.data, to);
        return;
      }

      // 2) Hot from the feed store (the user just tapped MORE on a feed card).
      //    The feed already has the hydrated LookupEntry, so reuse it instead
      //    of paying for another /api/lookup round-trip.
      const cached = useFeedStore
        .getState()
        .items.find((it) => entryId(it.query, it.from, it.to) === id && it.entry);
      if (cached?.entry) {
        setEntry(cached.entry);
        prewarmAll(cached.entry, to);
        return;
      }

      // 3) Cold path — call the LLM.
      try {
        const res = await fetch("/api/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, from, to }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Lookup failed (${res.status})`);
        }
        const data = (await res.json()) as LookupEntry;
        setEntry(data);
        prewarmAll(data, to);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    })();
  }, [id, query, from, to, router]);

  async function toggleSave() {
    if (!entry) return;
    if (saved) {
      await deleteEntry(id);
      setSaved(false);
      return;
    }
    const record: SavedEntry = {
      id,
      query,
      from,
      to,
      data: entry,
      createdAt: Date.now(),
    };
    await saveEntry(record);
    setSaved(true);
  }

  return (
    <div className="relative min-h-screen pb-32">
      <header className="sticky top-0 z-30 bg-cream/85 backdrop-blur pt-safe">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-2">
          <Link
            href="/"
            className="h-10 w-10 rounded-full bg-white shadow flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 truncate">
            <div className="text-[10px] uppercase tracking-wider text-ink/60">
              {from} → {to}
            </div>
            <div className="font-semibold truncate">{query}</div>
          </div>
          <button
            type="button"
            onClick={toggleSave}
            disabled={!entry}
            aria-label={saved ? "Remove from notebook" : "Save to notebook"}
            className={`h-10 px-3 rounded-full inline-flex items-center gap-1.5 text-sm font-semibold shadow transition active:scale-95 ${
              saved ? "bg-coral text-cream" : "bg-white text-ink"
            } disabled:opacity-50`}
          >
            <Heart size={16} fill={saved ? "currentColor" : "none"} />
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 mt-3 space-y-4">
        {error && (
          <div className="rounded-3xl bg-coral text-cream p-4">
            <div className="font-bold">Couldn&apos;t look that up.</div>
            <div className="mt-1 text-sm opacity-90">{error}</div>
            <button
              type="button"
              onClick={() => location.reload()}
              className="mt-3 rounded-full bg-cream text-ink px-3 py-1.5 text-sm font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        {!entry && !error && (
          <div className="rounded-3xl bg-white shadow-xl ring-1 ring-black/5 p-10 flex flex-col items-center gap-3 text-ink/60">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-sm">Riffing on this one…</span>
          </div>
        )}

        {entry && (
          <>
            <EntryCard entry={entry} toLang={to} />

            <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">
                In a nutshell
              </h3>
              <p className="mt-1.5 text-ink/90 leading-relaxed whitespace-pre-line">
                {entry.explanation}
              </p>
              {entry.nativeEquivalents && entry.nativeEquivalents.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {entry.nativeEquivalents.map((eq, i) => (
                    <span
                      key={i}
                      className="text-sm rounded-full bg-sunshine text-ink px-3 py-1 font-semibold"
                    >
                      {eq}
                    </span>
                  ))}
                </div>
              )}
            </section>

            <div className="space-y-3">
              {entry.examples.map((ex, i) => (
                <ExampleSentence key={i} example={ex} toLang={to} index={i} />
              ))}
            </div>

            <UsageNotes notes={entry.usageNotes} related={entry.related} from={from} to={to} />

            <ChatPanel entry={entry} query={query} from={from} to={to} />
          </>
        )}
      </main>
    </div>
  );
}

function prewarmAll(entry: LookupEntry, to: LangCode) {
  prewarmAudio(headlineTtsText(entry), to);
  for (const ex of entry.examples) prewarmAudio(ex.target, to);
}
