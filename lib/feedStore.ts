"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { FeedItem } from "@/components/FeedCard";

type FeedState = {
  items: FeedItem[];
  activeIdx: number;
  initialized: boolean;
  langKey: string;
  setItems: (updater: FeedItem[] | ((prev: FeedItem[]) => FeedItem[])) => void;
  setActiveIdx: (idx: number) => void;
  setInitialized: (v: boolean) => void;
  resetFor: (langKey: string) => void;
};

export const useFeedStore = create<FeedState>()(
  persist(
    (set, get) => ({
      items: [],
      activeIdx: 0,
      initialized: false,
      langKey: "",
      setItems: (updater) =>
        set({
          items: typeof updater === "function" ? updater(get().items) : updater,
        }),
      setActiveIdx: (idx) => set({ activeIdx: idx }),
      setInitialized: (v) => set({ initialized: v }),
      resetFor: (langKey) =>
        set({ items: [], activeIdx: 0, initialized: false, langKey }),
    }),
    {
      name: "dream-dict-feed",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      // Only persist data fields; sanitize transient per-card UI state.
      partialize: (s) => ({
        items: s.items.map((it) => ({
          query: it.query,
          from: it.from,
          to: it.to,
          kind: it.kind,
          entry: it.entry,
          imageDataUrl: it.imageDataUrl,
          // Reload anything stuck loading/error rather than leaving it broken.
          status: it.status === "ready" ? ("ready" as const) : ("loading" as const),
        })),
        activeIdx: s.activeIdx,
        initialized: s.initialized,
        langKey: s.langKey,
      }),
    },
  ),
);
