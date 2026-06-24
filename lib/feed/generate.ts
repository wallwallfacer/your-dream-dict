import "server-only";
import {
  appendItems,
  buildExclusions,
  feedCount,
  type FeedItemDTO,
  type NewFeedItem,
} from "./store";
import { generateRecommendations } from "./recommend";
import { listDueReviews } from "./reviews";
import { publish } from "./bus";
import { callLookup } from "../ai/lookup";
import { entryId } from "../entryId";
import type { LangCode } from "../languages";
import type { LookupEntry } from "../types";

const FRESH_COUNT = 8;
const REVIEW_LIMIT = 2;
const EXCLUDE_LIMIT = 500;
const PARALLEL_LOOKUPS = 4;

// Port of app/page.tsx interleave: slot one review every 3 cards starting at the
// 3rd card; otherwise emit fresh, falling back to leftover reviews at the end.
function interleave<T>(reviews: T[], fresh: T[]): T[] {
  const out: T[] = [];
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

// Generate full content for each term with bounded concurrency. Individual
// failures are dropped so one bad term doesn't sink the whole batch.
async function lookupAll(
  terms: string[],
  from: LangCode,
  to: LangCode,
): Promise<{ term: string; data: LookupEntry }[]> {
  const out: { term: string; data: LookupEntry }[] = [];
  for (let i = 0; i < terms.length; i += PARALLEL_LOOKUPS) {
    const slice = terms.slice(i, i + PARALLEL_LOOKUPS);
    const results = await Promise.all(
      slice.map(async (term) => {
        try {
          return { term, data: await callLookup(term, from, to) };
        } catch (e) {
          console.warn("[feed/generate] lookup failed for", term, e);
          return null;
        }
      }),
    );
    for (const r of results) if (r) out.push(r);
  }
  return out;
}

const inFlight = new Map<string, Promise<FeedItemDTO[]>>();

// Generate the next batch (fresh terms + due reviews, interleaved), append to
// the shared feed, and broadcast. Single-flight per lang_key: concurrent callers
// (e.g. two tabs both near the end) await the same generation instead of
// double-generating.
export function refillFeed(langKey: string, from: LangCode, to: LangCode): Promise<FeedItemDTO[]> {
  const existing = inFlight.get(langKey);
  if (existing) return existing;
  const p = doRefill(langKey, from, to).finally(() => inFlight.delete(langKey));
  inFlight.set(langKey, p);
  return p;
}

async function doRefill(langKey: string, from: LangCode, to: LangCode): Promise<FeedItemDTO[]> {
  const hadItems = feedCount(langKey) > 0;
  try {
    const { terms: excludeTerms, templates } = buildExclusions(langKey, from, to, EXCLUDE_LIMIT);
    const fresh = await generateRecommendations({
      from,
      to,
      exclude: excludeTerms,
      excludeTemplates: templates,
      count: FRESH_COUNT,
    });

    const lookups = await lookupAll(fresh, from, to);
    const freshItems: NewFeedItem[] = lookups.map((l) => ({
      id: entryId(l.term, from, to),
      kind: "new",
      query: l.term,
      from,
      to,
      data: l.data,
    }));

    const due = listDueReviews({ from, to, now: Date.now(), limit: REVIEW_LIMIT });
    const reviewItems: NewFeedItem[] = due.map((s) => ({
      id: s.id,
      kind: "review",
      query: s.query,
      from: s.from,
      to: s.to,
      data: s.data,
      imageDataUrl: s.imageDataUrl,
    }));

    const ordered = interleave(reviewItems, freshItems);
    const inserted = appendItems(langKey, ordered);
    if (inserted.length > 0) publish(langKey, { type: "items", payload: inserted });
    return inserted;
  } catch (e) {
    // If the feed already has content, a failed refill is non-fatal — keep what
    // viewers are seeing. Only surface the error when there's nothing to show.
    if (hadItems) {
      console.warn("[feed/generate] refill failed; keeping existing feed", e);
      return [];
    }
    throw e;
  }
}
