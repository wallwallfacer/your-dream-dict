"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { FeedCard, type FeedItem } from "@/components/FeedCard";
import { BottomNav } from "@/components/BottomNav";
import { ChatPanel } from "@/components/ChatPanel";
import {
  entryId,
  listEntries,
  recordReview,
  recordSeen,
  saveEntry,
  deleteEntry,
} from "@/lib/db/notebook";
import { prewarmAudio, headlineTtsText } from "@/lib/audio";
import { usePrefs } from "@/lib/prefs";
import { useFeedStore } from "@/lib/feedStore";
import { subscribeFeed, postCursor, requestRefill, isDriver } from "@/lib/feed/client";
import { langKey as langKeyOf } from "@/lib/entryId";
import type { LookupEntry, SavedEntry } from "@/lib/types";
import type { LangCode } from "@/lib/languages";

const REFILL_THRESHOLD = 5;

function prewarm(entry: LookupEntry, to: LangCode) {
  prewarmAudio(headlineTtsText(entry), to);
  for (const ex of entry.examples) prewarmAudio(ex.target, to);
}

export default function FeedPage() {
  const { from, to } = usePrefs();
  const langKey = langKeyOf(from, to);

  const items = useFeedStore((s) => s.items);
  const activeIdx = useFeedStore((s) => s.activeIdx);
  const storedLangKey = useFeedStore((s) => s.langKey);
  const remoteCursorSeq = useFeedStore((s) => s.remoteCursorSeq);
  const setActiveIdx = useFeedStore((s) => s.setActiveIdx);
  const resetFor = useFeedStore((s) => s.resetFor);

  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [chatItem, setChatItem] = useState<FeedItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialPositionedRef = useRef(false);

  // Subscribe to the shared server feed for this language pair. Re-subscribes
  // (and resets the queue) whenever the language pair changes.
  useEffect(() => {
    if (storedLangKey !== langKey) {
      resetFor(langKey);
      initialPositionedRef.current = false;
    }
    const unsubscribe = subscribeFeed(langKey);
    return unsubscribe;
  }, [langKey, storedLangKey, resetFor]);

  // Keep the saved (heart) state in sync with the notebook on mount and whenever
  // the tab regains focus (e.g. after saving from /lookup).
  useEffect(() => {
    const refresh = () =>
      void listEntries().then((saved) => setSavedSet(new Set(saved.map((s) => s.id))));
    refresh();
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Track which card is in view via scroll position; broadcast it when driving,
  // and ask the server to extend the feed as we near the end.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const idx = Math.round(el.scrollTop / el.clientHeight);
        const state = useFeedStore.getState();
        if (state.activeIdx !== idx) {
          setActiveIdx(idx);
          const seq = state.items[idx]?.seq;
          if (seq != null) postCursor(langKey, seq);
        }
        if (state.items.length - idx <= REFILL_THRESHOLD) {
          requestRefill(langKey, from, to);
        }
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [langKey, from, to, setActiveIdx]);

  // Mirror the shared cursor: scroll to it on connect (any tab) and whenever it
  // moves while this tab is a follower. The driver steers itself.
  useEffect(() => {
    if (remoteCursorSeq == null) return;
    const el = containerRef.current;
    if (!el) return;
    const idx = items.findIndex((it) => it.seq === remoteCursorSeq);
    if (idx < 0) return; // items for that seq not merged yet; re-runs when they arrive
    const shouldScroll = !initialPositionedRef.current || !isDriver();
    if (!shouldScroll) return;
    initialPositionedRef.current = true;
    if (Math.round(el.scrollTop / el.clientHeight) !== idx) {
      el.scrollTop = idx * el.clientHeight;
    }
  }, [remoteCursorSeq, items]);

  // Prewarm audio for the active + next card so playback is instant.
  useEffect(() => {
    for (let i = activeIdx; i < Math.min(activeIdx + 2, items.length); i++) {
      const it = items[i];
      if (it?.entry) prewarm(it.entry, it.to);
    }
  }, [activeIdx, items]);

  // Record a "seen" (and, for review cards, a review pass) once the active card
  // is in view. Deduped per card within this session. Feeds server-side dedup
  // via the existing /api/sync push.
  const recordedRef = useRef<Set<string>>(new Set());
  const current = items[activeIdx];
  useEffect(() => {
    if (!current?.entry) return;
    const id = entryId(current.query, current.from, current.to);
    if (recordedRef.current.has(id)) return;
    recordedRef.current.add(id);
    void recordSeen({
      id,
      query: current.query,
      from: current.from,
      to: current.to,
      term: current.entry.term,
      termSegments: current.entry.termSegments,
    }).catch((e) => console.warn("[feed] recordSeen failed", e));
    if (current.kind === "review") {
      void recordReview(id).catch((e) => console.warn("[feed] recordReview failed", e));
    }
  }, [current]);

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

  const showEmpty = items.length === 0;

  return (
    <div className="relative h-dvh w-screen bg-paper overflow-hidden">
      {showEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-ink gap-4 px-6 text-center">
          <Loader2 className="animate-spin" size={28} />
          <span className="text-sm text-muted">Picking some good ones for you…</span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => requestRefill(langKey, from, to)}
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
              key={`${id}-${it.seq}`}
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
