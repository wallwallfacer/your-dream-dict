import { getFeedSince, getCursor, feedCount } from "@/lib/feed/store";
import { subscribe, type FeedEvent } from "@/lib/feed/bus";
import { refillFeed } from "@/lib/feed/generate";
import { parseLangKey } from "@/lib/entryId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

// Server-Sent Events stream of the shared feed for one language pair.
// Emits: `snapshot` (current items + cursor) on connect, then `items` and
// `cursor` events as the feed grows / the active card moves.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const langKey = url.searchParams.get("langKey") ?? "";
  const sinceSeq = Math.max(0, Number(url.searchParams.get("sinceSeq") ?? "0") || 0);
  const parsed = parseLangKey(langKey);
  if (!parsed) {
    return new Response(JSON.stringify({ error: "Invalid langKey" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { from, to } = parsed;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // Subscribe before the snapshot so nothing published mid-connect is lost;
      // the client dedupes by seq.
      const unsubscribe = subscribe(langKey, (evt: FeedEvent) => send(evt.type, evt.payload));

      send("snapshot", {
        items: getFeedSince(langKey, sinceSeq),
        cursor: getCursor(langKey),
      });

      // First viewer of an empty feed: kick off generation so it isn't blank.
      // refillFeed publishes an `items` event which reaches this subscriber.
      if (feedCount(langKey) === 0) {
        void refillFeed(langKey, from, to).catch((e) =>
          console.warn("[feed/stream] initial refill failed", e),
        );
      }

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: hb\n\n`));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events flush immediately through the tunnel.
      "X-Accel-Buffering": "no",
    },
  });
}
