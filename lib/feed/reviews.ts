import "server-only";
import { getDb } from "../sync/server";
import { isDue, nextDueAt } from "../review";
import type { LangCode } from "../languages";
import type { LookupEntry, SavedEntry } from "../types";

type EntryRow = {
  id: string;
  query: string;
  from_lang: string;
  to_lang: string;
  data_json: string;
  image_data_url: string | null;
  created_at: number;
  updated_at: number;
  deleted: number;
  last_reviewed_at: number | null;
  review_count: number | null;
};

function rowToSaved(r: EntryRow): SavedEntry {
  return {
    id: r.id,
    query: r.query,
    from: r.from_lang as LangCode,
    to: r.to_lang as LangCode,
    data: JSON.parse(r.data_json) as LookupEntry,
    imageDataUrl: r.image_data_url ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deleted: r.deleted === 1,
    lastReviewedAt: r.last_reviewed_at ?? undefined,
    reviewCount: r.review_count ?? undefined,
  };
}

// Server port of lib/db/notebook.ts listDueReviews: spaced-repetition entries
// for a language pair that are due now, soonest-due first. Reuses the shared
// isDue/nextDueAt schedule from lib/review.ts.
export function listDueReviews(opts: {
  from: LangCode;
  to: LangCode;
  now: number;
  limit: number;
}): SavedEntry[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM entries WHERE deleted = 0 AND from_lang = ? AND to_lang = ?",
    )
    .all(opts.from, opts.to) as EntryRow[];
  const due = rows.map(rowToSaved).filter((e) => isDue(e, opts.now));
  due.sort((a, b) => nextDueAt(a) - nextDueAt(b));
  return due.slice(0, opts.limit);
}
