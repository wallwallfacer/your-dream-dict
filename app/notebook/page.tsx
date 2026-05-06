"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookHeart, Sparkles, Flame, Trash2, Search as SearchIcon, X } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { listEntries, deleteEntry } from "@/lib/db/notebook";
import type { SavedEntry } from "@/lib/types";

export default function NotebookPage() {
  const [items, setItems] = useState<SavedEntry[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    listEntries().then(setItems).catch(() => setItems([]));
  }, []);

  async function remove(id: string) {
    await deleteEntry(id);
    setItems((prev) => (prev ?? []).filter((it) => it.id !== id));
  }

  const filtered = useMemo(() => {
    if (!items) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => {
      const haystack = [
        it.query,
        it.data.term,
        it.data.explanation,
        ...(it.data.nativeEquivalents ?? []),
        ...it.data.examples.flatMap((e) => [e.target, e.native]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, q]);

  const total = items?.length ?? 0;
  const shown = filtered?.length ?? 0;

  return (
    <div className="relative min-h-screen pb-32">
      <header className="mx-auto max-w-md px-5 pt-safe pt-10 pb-3">
        <div className="flex items-center gap-2 text-ink">
          <BookHeart className="text-coral" size={22} />
          <span className="text-sm font-bold tracking-wide uppercase opacity-80">
            Your notebook
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight">
          {items === null
            ? "Loading…"
            : total === 0
              ? "Save a word and it'll land here."
              : q.trim()
                ? `${shown} match${shown === 1 ? "" : "es"}`
                : `${total} thing${total === 1 ? "" : "s"} you've saved`}
        </h1>
      </header>

      {items && items.length > 0 && (
        <>
          <div className="mx-auto max-w-md px-5 grid grid-cols-2 gap-3">
            <Link
              href="/notebook/story"
              className="rounded-3xl bg-berry text-cream p-4 shadow-md active:scale-[0.98] transition"
            >
              <Sparkles size={22} />
              <div className="mt-2 font-extrabold leading-tight">Tell me a story</div>
              <div className="text-xs opacity-90 mt-1">
                Weave them together into something silly &amp; memorable.
              </div>
            </Link>
            <Link
              href="/"
              className="rounded-3xl bg-sky text-cream p-4 shadow-md active:scale-[0.98] transition"
            >
              <Flame size={22} />
              <div className="mt-2 font-extrabold leading-tight">Review in feed</div>
              <div className="text-xs opacity-90 mt-1">
                These words will surface on For You.
              </div>
            </Link>
          </div>

          <div className="sticky top-0 z-30 bg-cream/85 backdrop-blur mt-4">
            <div className="mx-auto max-w-md px-5 py-3">
              <div className="relative">
                <SearchIcon
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/50 pointer-events-none"
                />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search saved entries…"
                  className="w-full rounded-2xl bg-white pl-9 pr-9 py-2.5 text-sm shadow-sm ring-1 ring-black/5 outline-none focus:ring-2 focus:ring-sky"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-ink/10 text-ink/70 flex items-center justify-center active:scale-90"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <main className="mx-auto max-w-md px-3">
            {filtered && filtered.length > 0 ? (
              <ul className="divide-y divide-black/5 rounded-2xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden">
                {filtered.map((it) => (
                  <li key={it.id} className="flex items-stretch">
                    <Link
                      href={`/lookup?q=${encodeURIComponent(it.query)}&from=${it.from}&to=${it.to}`}
                      className="flex-1 min-w-0 px-4 py-3 active:bg-ink/5 transition"
                    >
                      <div className="font-semibold text-ink leading-snug truncate">
                        {it.data.term}
                      </div>
                      <div className="mt-0.5 text-xs text-ink/60 truncate">
                        {it.data.explanation}
                      </div>
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(it.id)}
                      aria-label="Remove"
                      className="shrink-0 self-center mr-2 h-9 w-9 rounded-full text-ink/40 hover:text-coral hover:bg-coral/10 flex items-center justify-center active:scale-90"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : q.trim() ? (
              <div className="text-center text-ink/50 text-sm py-10 px-5">
                No matches for &ldquo;{q}&rdquo;
              </div>
            ) : null}
          </main>
        </>
      )}

      <BottomNav />
    </div>
  );
}
