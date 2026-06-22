"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { FeedCard, type FeedItem } from "@/components/FeedCard";
import { BottomNav } from "@/components/BottomNav";
import { ChatPanel } from "@/components/ChatPanel";
import {
  entryId,
  listEntries,
  listRecentSeen,
  listDueReviews,
  recordReview,
  recordSeen,
  saveEntry,
  deleteEntry,
} from "@/lib/db/notebook";
import { prewarmAudio, headlineTtsText } from "@/lib/audio";
import { usePrefs } from "@/lib/prefs";
import { useFeedStore } from "@/lib/feedStore";
import { templateSkeleton } from "@/lib/templates";
import type { LookupEntry, SavedEntry } from "@/lib/types";
import type { LangCode } from "@/lib/languages";
import { withBasePath } from "@/lib/basePath";

const HYDRATE_AHEAD = 2;
const FETCH_BATCH = 20;
const TARGET_QUEUE = 10;
const REFILL_THRESHOLD = 5;
const REVIEW_LIMIT_INITIAL = 3;
const REVIEW_LIMIT_REFILL = 2;
const EXCLUDE_TOP_N = 500;

// Recency-aware dedup: map key (lowercased term or template skeleton) → max
// timestamp last seen. At fetch time we sort desc + slice the top N so the
// LLM exclusion list always reflects the user's *most recent* exposure, not
// whichever entry happened to be inserted first.
function bumpRef(map: Map<string, number>, key: string, ts: number): void {
  if (!key) return;
  const prev = map.get(key) ?? 0;
  if (ts > prev) map.set(key, ts);
}

function topByRecency(map: Map<string, number>, n: number): string[] {
  if (map.size <= n) {
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function interleave(reviews: FeedItem[], fresh: FeedItem[]): FeedItem[] {
  // Slot one review every 3 cards starting at index 2 (3rd card).
  const out: FeedItem[] = [];
  let r = 0;
  let n = 0;
  let i = 0;
  while (n < fresh.length || r < reviews.length) {
    const slotForReview = i > 0 && i % 3 === 2 && r < reviews.length;
    if (slotForReview) {
      out.push(reviews[r++]);
    } else if (n < fresh.length) {
      out.push(fresh[n++]);
    } else if (r < reviews.length) {
      out.push(reviews[r++]);
    }
    i++;
  }
  return out;
}

function reviewToItem(saved: SavedEntry): FeedItem {
  return {
    query: saved.query,
    from: saved.from,
    to: saved.to,
    kind: "review",
    entry: saved.data,
    imageDataUrl: saved.imageDataUrl,
    status: "ready",
  };
}

export default function FeedPage() {
  const { from, to } = usePrefs();
  const langKey = `${from}-${to}`;
  const items = useFeedStore((s) => s.items);
  const activeIdx = useFeedStore((s) => s.activeIdx);
  const initialized = useFeedStore((s) => s.initialized);
  const storedLangKey = useFeedStore((s) => s.langKey);
  const setItems = useFeedStore((s) => s.setItems);
  const setActiveIdx = useFeedStore((s) => s.setActiveIdx);
  const setInitialized = useFeedStore((s) => s.setInitialized);
  const resetFor = useFeedStore((s) => s.resetFor);

  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [chatItem, setChatItem] = useState<FeedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refilling, setRefilling] = useState(false);
  const seenRef = useRef<Map<string, number>>(new Map());
  // Parallel template-skeleton dedup: collapses slot fills + paraphrase variants
  // (with the prompt's help) so we don't keep re-recommending the same scaffold.
  const templatesRef = useRef<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);

  const loadInitial = useCallback(async () => {
    setError(null);
    try {
      const now = Date.now();
      const [saved, recentSeen, due] = await Promise.all([
        listEntries(),
        listRecentSeen(200),
        listDueReviews({ from, to, now, limit: REVIEW_LIMIT_INITIAL }),
      ]);
      setSavedSet(new Set(saved.map((s) => s.id)));
      saved.forEach((s) => {
        const ts = s.lastReviewedAt ?? s.updatedAt ?? s.createdAt;
        bumpRef(seenRef.current, s.data.term.toLowerCase(), ts);
        bumpRef(templatesRef.current, templateSkeleton(s.data.termSegments, s.data.term), ts);
      });
      recentSeen
        .filter((r) => r.from === from && r.to === to)
        .forEach((r) => {
          bumpRef(seenRef.current, r.term.toLowerCase(), r.lastSeenAt);
          bumpRef(templatesRef.current, templateSkeleton(r.termSegments, r.term), r.lastSeenAt);
        });

      const reviewItems = due.map(reviewToItem);
      reviewItems.forEach((it) => {
        if (it.entry) prewarmReview(it.entry, it.to);
      });

      // Recommendations can be slow / flaky on mobile via tunneled proxies.
      // If we already have reviews to show, surface them and treat the recs
      // failure as a soft error so the feed isn't blank.
      let fresh: string[] = [];
      try {
        fresh = await fetchFresh(
          from,
          to,
          topByRecency(seenRef.current, EXCLUDE_TOP_N),
          topByRecency(templatesRef.current, EXCLUDE_TOP_N),
        );
      } catch (e) {
        if (reviewItems.length === 0) throw e;
        console.warn("[feed] initial recommendations failed; showing reviews only", e);
      }

      const freshItems: FeedItem[] = fresh.map((term) => ({
        query: term,
        from,
        to,
        kind: "new",
        status: "loading",
      }));
      setItems(interleave(reviewItems, freshItems));
      setInitialized(true);
    } catch (e) {
      setError(toErrorMessage(e));
    }
  }, [from, to, setItems, setInitialized]);

  // Reset feed when language pair changes
  useEffect(() => {
    if (storedLangKey && storedLangKey !== langKey) {
      resetFor(langKey);
      seenRef.current = new Map();
      templatesRef.current = new Map();
      restoredScrollRef.current = false;
    } else if (!storedLangKey) {
      resetFor(langKey);
    }
  }, [langKey, storedLangKey, resetFor]);

  // Initialize the feed once per language pair
  useEffect(() => {
    if (initialized) return;
    if (storedLangKey !== langKey) return;
    void loadInitial();
  }, [initialized, storedLangKey, langKey, loadInitial]);

  // Restore scroll position on remount (e.g., navigating back from /lookup)
  useEffect(() => {
    if (restoredScrollRef.current) return;
    if (items.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = activeIdx * el.clientHeight;
    restoredScrollRef.current = true;
  }, [items.length, activeIdx]);

  // Every mount (incl. when the queue was restored from persistence): refresh
  // savedSet from IndexedDB so the heart reflects any changes from /lookup,
  // and seed seenRef with saved terms + recent seen-history + restored queue
  // items so refills don't recommend stuff the user already saw last session.
  useEffect(() => {
    void Promise.all([listEntries(), listRecentSeen(200)]).then(
      ([saved, recent]) => {
        const now = Date.now();
        setSavedSet(new Set(saved.map((s) => s.id)));
        saved.forEach((s) => {
          const ts = s.lastReviewedAt ?? s.updatedAt ?? s.createdAt;
          bumpRef(seenRef.current, s.data.term.toLowerCase(), ts);
          bumpRef(templatesRef.current, templateSkeleton(s.data.termSegments, s.data.term), ts);
        });
        recent
          .filter((r) => r.from === from && r.to === to)
          .forEach((r) => {
            bumpRef(seenRef.current, r.term.toLowerCase(), r.lastSeenAt);
            bumpRef(templatesRef.current, templateSkeleton(r.termSegments, r.term), r.lastSeenAt);
          });
        for (const it of useFeedStore.getState().items) {
          if (it.entry) {
            bumpRef(seenRef.current, it.entry.term.toLowerCase(), now);
            bumpRef(templatesRef.current, templateSkeleton(it.entry.termSegments, it.entry.term), now);
          }
          bumpRef(seenRef.current, it.query.toLowerCase(), now);
        }
      },
    );
  }, [from, to]);

  const hydratingRef = useRef<Set<number>>(new Set());
  const hydrate = useCallback(async (index: number) => {
    const cur = items[index];
    if (!cur || cur.status !== "loading") return;
    if (hydratingRef.current.has(index)) return;
    hydratingRef.current.add(index);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const lookupRes = await fetch(withBasePath("/api/lookup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: cur.query, from: cur.from, to: cur.to }),
        signal: controller.signal,
      });
      if (!lookupRes.ok) {
        const errBody = await lookupRes.json().catch(() => ({}));
        throw new Error(errBody.error ?? `Lookup failed (${lookupRes.status})`);
      }
      const entry = (await lookupRes.json()) as LookupEntry;
      const now = Date.now();
      bumpRef(seenRef.current, entry.term.toLowerCase(), now);
      bumpRef(templatesRef.current, templateSkeleton(entry.termSegments, entry.term), now);

      // Fire pre-warm in background
      prewarmReview(entry, cur.to);

      setItems((prev) =>
        prev.map((it, i) =>
          i === index ? { ...it, entry, status: "ready" as const } : it,
        ),
      );
    } catch (e) {
      setItems((prev) =>
        prev.map((it, i) =>
          i === index
            ? { ...it, status: "error" as const, error: toErrorMessage(e) }
            : it,
        ),
      );
    } finally {
      clearTimeout(timer);
      hydratingRef.current.delete(index);
    }
  }, [items, setItems]);

  // Hydrate current + next N
  useEffect(() => {
    for (let i = activeIdx; i < Math.min(activeIdx + HYDRATE_AHEAD + 1, items.length); i++) {
      void hydrate(i);
    }
  }, [activeIdx, items.length, hydrate]);

  // Persist a "seen" record once the active card is fully ready. Dedupe within
  // this session so we only write once per card scroll-in (count++ on revisit
  // happens via lookups across sessions, not within one).
  const recordedRef = useRef<Set<string>>(new Set());
  const current = items[activeIdx];
  const currentReadyTerm =
    current?.status === "ready" ? current.entry?.term : undefined;
  useEffect(() => {
    if (!current || current.status !== "ready" || !current.entry) return;
    const id = entryId(current.query, current.from, current.to);
    if (recordedRef.current.has(id)) return;
    recordedRef.current.add(id);
    const now = Date.now();
    bumpRef(seenRef.current, current.entry.term.toLowerCase(), now);
    bumpRef(templatesRef.current, templateSkeleton(current.entry.termSegments, current.entry.term), now);
    void recordSeen({
      id,
      query: current.query,
      from: current.from,
      to: current.to,
      term: current.entry.term,
      termSegments: current.entry.termSegments,
    }).catch((e) => console.warn("[feed] recordSeen failed", e));
    if (current.kind === "review") {
      void recordReview(id).catch((e) =>
        console.warn("[feed] recordReview failed", e),
      );
    }
  }, [activeIdx, current, currentReadyTerm]);

  // Refill when nearing end
  useEffect(() => {
    if (refilling) return;
    if (items.length === 0) return;
    if (items.length - activeIdx > REFILL_THRESHOLD) return;
    if (items.length >= TARGET_QUEUE * 2) return;
    setRefilling(true);
    (async () => {
      try {
        const now = Date.now();
        const [fresh, due] = await Promise.all([
          fetchFresh(
            from,
            to,
            topByRecency(seenRef.current, EXCLUDE_TOP_N),
            topByRecency(templatesRef.current, EXCLUDE_TOP_N),
          ),
          listDueReviews({ from, to, now, limit: REVIEW_LIMIT_REFILL }),
        ]);
        const freshItems: FeedItem[] = fresh.map((term) => ({
          query: term,
          from,
          to,
          kind: "new",
          status: "loading",
        }));
        const queue = useFeedStore.getState().items;
        const queueIds = new Set(queue.map((it) => entryId(it.query, it.from, it.to)));
        const reviewItems = due
          .filter((s) => !queueIds.has(s.id))
          .map(reviewToItem);
        reviewItems.forEach((it) => {
          if (it.entry) prewarmReview(it.entry, it.to);
        });
        setItems((prev) => [...prev, ...interleave(reviewItems, freshItems)]);
      } catch (e) {
        console.warn("[feed] refill failed", e);
      } finally {
        setRefilling(false);
      }
    })();
  }, [activeIdx, items.length, refilling, from, to, setItems]);

  // Track which card is in view via scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const idx = Math.round(el.scrollTop / el.clientHeight);
        if (useFeedStore.getState().activeIdx !== idx) {
          setActiveIdx(idx);
        }
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [setActiveIdx]);

  async function toggleSave(item: FeedItem) {
    if (!item.entry) return;
    const id = entryId(item.query, item.from, item.to);
    if (savedSet.has(id)) {
      await deleteEntry(id);
      setSavedSet((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return;
    }
    const record: SavedEntry = {
      id,
      query: item.query,
      from: item.from,
      to: item.to,
      data: item.entry,
      imageDataUrl: item.imageDataUrl,
      createdAt: Date.now(),
    };
    await saveEntry(record);
    setSavedSet((prev) => new Set(prev).add(id));
  }

  const showEmpty = items.length === 0 && !error;

  return (
    <div className="relative h-dvh w-screen bg-paper overflow-hidden">
      {showEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-ink gap-3 px-6 text-center">
          <Loader2 className="animate-spin" size={28} />
          <span className="text-sm text-muted">Picking some good ones for you…</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-ink gap-4 px-6 text-center">
          <div className="font-serif text-2xl text-ink">Couldn&apos;t load the feed.</div>
          <div className="text-sm text-muted">{error}</div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void loadInitial()}
              className="inline-flex items-center gap-2 rounded-full bg-vermilion text-white px-4 py-2 font-semibold text-sm"
            >
              <RefreshCw size={16} /> Try again
            </button>
            <Link
              href="/search"
              className="inline-flex items-center gap-2 rounded-full bg-paper border-[1.5px] border-line text-ink px-4 py-2 font-semibold text-sm"
            >
              <Search size={16} /> Manual lookup
            </Link>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="h-full w-full overflow-y-auto snap-y snap-mandatory scrollbar-none"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {items.map((it, i) => {
          const id = entryId(it.query, it.from, it.to);
          return (
            <div
              key={`${id}-${i}`}
              className="h-dvh w-screen snap-start"
              style={{ scrollSnapAlign: "start" }}
            >
              <FeedCard
                item={it}
                saved={savedSet.has(id)}
                onSave={() => void toggleSave(it)}
                onAsk={() => setChatItem(it)}
                isFirst={i === 0}
                isLast={i === items.length - 1}
              />
            </div>
          );
        })}
      </div>

      {chatItem?.entry && (
        <ChatPanel
          key={entryId(chatItem.query, chatItem.from, chatItem.to)}
          entry={chatItem.entry}
          query={chatItem.query}
          from={chatItem.from}
          to={chatItem.to}
          forceOpen
          onClose={() => setChatItem(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}

const FETCH_TIMEOUT_MS = 60_000;

function toErrorMessage(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") {
    return "Took too long. Check your connection and try again.";
  }
  if (e instanceof TypeError) {
    // Native "TypeError: Failed to fetch" (Chrome/Edge) etc. — connection
    // never landed or was dropped before headers came back.
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return e instanceof Error ? e.message : "Could not load feed";
}

async function fetchFresh(
  from: LangCode,
  to: LangCode,
  exclude: string[],
  excludeTemplates: string[],
): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(withBasePath("/api/recommendations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, exclude, excludeTemplates, count: FETCH_BATCH }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error ?? `Recommendations failed (${res.status})`);
    }
    const data = (await res.json()) as { terms: string[] };
    return data.terms;
  } finally {
    clearTimeout(timer);
  }
}

function prewarmReview(entry: LookupEntry, to: LangCode) {
  prewarmAudio(headlineTtsText(entry), to);
  for (const ex of entry.examples) prewarmAudio(ex.target, to);
}

