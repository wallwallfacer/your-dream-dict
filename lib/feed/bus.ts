import "server-only";
import type { FeedItemDTO } from "./store";

// Events fanned out to every browser subscribed (via SSE) to a language pair.
export type FeedEvent =
  | { type: "items"; payload: FeedItemDTO[] }
  | { type: "cursor"; payload: { seq: number } };

type Subscriber = (event: FeedEvent) => void;

// In-process pub/sub keyed by lang_key. Sufficient because the server is a
// single Node process with an in-process SQLite handle.
const channels = new Map<string, Set<Subscriber>>();

export function subscribe(langKey: string, fn: Subscriber): () => void {
  let set = channels.get(langKey);
  if (!set) {
    set = new Set();
    channels.set(langKey, set);
  }
  set.add(fn);
  return () => {
    const s = channels.get(langKey);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) channels.delete(langKey);
  };
}

export function publish(langKey: string, event: FeedEvent): void {
  const set = channels.get(langKey);
  if (!set) return;
  for (const fn of set) {
    // A dead subscriber must not break the others.
    try {
      fn(event);
    } catch {
      /* ignore */
    }
  }
}
