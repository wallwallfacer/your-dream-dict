"use client";

import { create } from "zustand";
import type { FeedItem } from "@/components/FeedCard";

// A feed card plus its server-assigned sequence number. The server feed is the
// source of truth now, so this store is in-memory only (no persistence) — items
// are (re)hydrated from the SSE snapshot on every mount.
export type ClientFeedItem = FeedItem & { seq: number };

type FeedState = {
  langKey: string;
  items: ClientFeedItem[];
  activeIdx: number;
  // Cursor pushed by the server (driver tab). Follower tabs scroll to it.
  remoteCursorSeq: number | null;

  resetFor: (langKey: string) => void;
  mergeItems: (incoming: ClientFeedItem[]) => void;
  setActiveIdx: (idx: number) => void;
  setRemoteCursor: (seq: number) => void;
};

export const useFeedStore = create<FeedState>()((set, get) => ({
  langKey: "",
  items: [],
  activeIdx: 0,
  remoteCursorSeq: null,

  resetFor: (langKey) =>
    set({ langKey, items: [], activeIdx: 0, remoteCursorSeq: null }),

  // Append items we don't already have (dedupe by seq), keep sorted by seq.
  mergeItems: (incoming) => {
    if (incoming.length === 0) return;
    const seen = new Set(get().items.map((it) => it.seq));
    const fresh = incoming.filter((it) => !seen.has(it.seq));
    if (fresh.length === 0) return;
    const merged = [...get().items, ...fresh].sort((a, b) => a.seq - b.seq);
    set({ items: merged });
  },

  setActiveIdx: (idx) => set({ activeIdx: idx }),
  setRemoteCursor: (seq) => set({ remoteCursorSeq: seq }),
}));

// Highest seq we currently hold — used as the SSE reconnect cursor.
export function lastSeqOf(items: ClientFeedItem[]): number {
  return items.length > 0 ? items[items.length - 1].seq : 0;
}
