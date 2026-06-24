"use client";

import { withBasePath } from "../basePath";
import { useFeedStore, lastSeqOf, type ClientFeedItem } from "../feedStore";
import type { LangCode } from "../languages";

// Server feed item over the wire (mirrors lib/feed/store.ts FeedItemDTO).
type FeedItemDTO = {
  id: string;
  seq: number;
  kind: "new" | "review";
  query: string;
  from: LangCode;
  to: LangCode;
  data: ClientFeedItem["entry"];
  imageDataUrl?: string;
};

function toClientItem(dto: FeedItemDTO): ClientFeedItem {
  return {
    seq: dto.seq,
    query: dto.query,
    from: dto.from,
    to: dto.to,
    kind: dto.kind,
    entry: dto.data,
    imageDataUrl: dto.imageDataUrl,
    status: "ready",
  };
}

// This tab is the "driver" (broadcasts its scroll position) only while it is the
// focused, visible tab. Everyone else follows the server cursor.
export function isDriver(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible" && document.hasFocus();
}

const RECONNECT_DELAY_MS = 1500;

// Open an SSE connection for a language pair and pipe items/cursor into the
// store. Reconnects on drop, resuming from the highest seq already held. The
// server derives from/to from langKey. Returns a cleanup function.
export function subscribeFeed(langKey: string): () => void {
  let es: EventSource | null = null;
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (stopped) return;
    const sinceSeq = lastSeqOf(useFeedStore.getState().items);
    const url = withBasePath(
      `/api/feed/stream?langKey=${encodeURIComponent(langKey)}&sinceSeq=${sinceSeq}`,
    );
    es = new EventSource(url);

    const onItems = (e: MessageEvent) => {
      const items = (JSON.parse(e.data) as FeedItemDTO[]).map(toClientItem);
      useFeedStore.getState().mergeItems(items);
    };
    es.addEventListener("items", onItems);

    es.addEventListener("snapshot", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as { items: FeedItemDTO[]; cursor: number | null };
      useFeedStore.getState().mergeItems(data.items.map(toClientItem));
      // Land on the shared position on connect (for any tab).
      if (data.cursor != null) useFeedStore.getState().setRemoteCursor(data.cursor);
    });

    es.addEventListener("cursor", (e: MessageEvent) => {
      const { seq } = JSON.parse(e.data) as { seq: number };
      // Live cursor moves only steer follower tabs; the driver controls itself.
      if (!isDriver()) useFeedStore.getState().setRemoteCursor(seq);
    });

    es.onerror = () => {
      // EventSource would auto-reconnect to the same URL, but we want to resume
      // from the latest seq — so close and reopen ourselves.
      es?.close();
      es = null;
      if (stopped || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, RECONNECT_DELAY_MS);
    };
  };

  open();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    es?.close();
    es = null;
  };
}

let cursorTimer: ReturnType<typeof setTimeout> | null = null;
const CURSOR_DEBOUNCE_MS = 250;

// Broadcast this tab's current card position. No-op unless this tab is the
// driver, so background tabs never fight the focused one for the cursor.
export function postCursor(langKey: string, seq: number): void {
  if (!isDriver()) return;
  if (cursorTimer) clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    cursorTimer = null;
    void fetch(withBasePath("/api/feed/cursor"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ langKey, seq }),
    }).catch((e) => console.warn("[feed] postCursor failed", e));
  }, CURSOR_DEBOUNCE_MS);
}

let refilling = false;

// Ask the server to extend the shared feed. Focused tab only; single-flight on
// the client (the server is also single-flight per langKey).
export function requestRefill(langKey: string, from: LangCode, to: LangCode): void {
  if (!isDriver() || refilling) return;
  refilling = true;
  void fetch(withBasePath("/api/feed/refill"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ langKey, from, to }),
  })
    .catch((e) => console.warn("[feed] requestRefill failed", e))
    .finally(() => {
      refilling = false;
    });
}
