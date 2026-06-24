import "server-only";
import { getDb } from "../sync/server";
import { templateSkeleton } from "../templates";
import type { LangCode } from "../languages";
import type { LookupEntry, TermSegment } from "../types";

// Transport shape for a single feed card. `query` is the headword/term;
// `data` is the fully-generated LookupEntry so every browser renders identically.
export type FeedItemDTO = {
  id: string;
  seq: number;
  kind: "new" | "review";
  query: string;
  from: LangCode;
  to: LangCode;
  data: LookupEntry;
  imageDataUrl?: string;
};

// What a caller appends; seq is assigned by the store.
export type NewFeedItem = Omit<FeedItemDTO, "seq">;

type FeedRow = {
  id: string;
  lang_key: string;
  seq: number;
  kind: string;
  query: string;
  from_lang: string;
  to_lang: string;
  data_json: string;
  image_data_url: string | null;
  created_at: number;
};

function rowToItem(r: FeedRow): FeedItemDTO {
  return {
    id: r.id,
    seq: r.seq,
    kind: r.kind === "review" ? "review" : "new",
    query: r.query,
    from: r.from_lang as LangCode,
    to: r.to_lang as LangCode,
    data: JSON.parse(r.data_json) as LookupEntry,
    imageDataUrl: r.image_data_url ?? undefined,
  };
}

export function getFeedSince(langKey: string, sinceSeq: number): FeedItemDTO[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM feed_items WHERE lang_key = ? AND seq > ? ORDER BY seq",
    )
    .all(langKey, sinceSeq) as FeedRow[];
  return rows.map(rowToItem);
}

export function feedCount(langKey: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM feed_items WHERE lang_key = ?")
    .get(langKey) as { n: number };
  return row.n;
}

export function countAhead(langKey: string, fromSeq: number): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM feed_items WHERE lang_key = ? AND seq > ?")
    .get(langKey, fromSeq) as { n: number };
  return row.n;
}

function maxSeq(langKey: string): number {
  const row = getDb()
    .prepare("SELECT MAX(seq) AS m FROM feed_items WHERE lang_key = ?")
    .get(langKey) as { m: number | null };
  return row.m ?? 0;
}

// Append items in order, assigning monotonic seq. Items whose id already exists
// in the feed are skipped (so a review can't be queued twice). Returns the rows
// actually inserted, with their assigned seq.
export function appendItems(langKey: string, items: NewFeedItem[]): FeedItemDTO[] {
  const handle = getDb();
  const insert = handle.prepare(`
    INSERT INTO feed_items (id, lang_key, seq, kind, query, from_lang, to_lang, data_json, image_data_url, created_at)
    VALUES (@id, @langKey, @seq, @kind, @query, @fromLang, @toLang, @dataJson, @imageDataUrl, @createdAt)
    ON CONFLICT(id) DO NOTHING
  `);
  const inserted: FeedItemDTO[] = [];
  const tx = handle.transaction(() => {
    let seq = maxSeq(langKey);
    const now = Date.now();
    for (const it of items) {
      seq += 1;
      const res = insert.run({
        id: it.id,
        langKey,
        seq,
        kind: it.kind,
        query: it.query,
        fromLang: it.from,
        toLang: it.to,
        dataJson: JSON.stringify(it.data),
        imageDataUrl: it.imageDataUrl ?? null,
        createdAt: now,
      });
      if (res.changes > 0) {
        inserted.push({ ...it, seq });
      } else {
        // id collided with an existing card → don't burn the seq number.
        seq -= 1;
      }
    }
  });
  tx();
  return inserted;
}

export function getCursor(langKey: string): number | null {
  const row = getDb()
    .prepare("SELECT active_seq FROM feed_cursor WHERE lang_key = ?")
    .get(langKey) as { active_seq: number } | undefined;
  return row?.active_seq ?? null;
}

export function setCursor(langKey: string, seq: number, ts: number): void {
  getDb()
    .prepare(`
      INSERT INTO feed_cursor (lang_key, active_seq, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(lang_key) DO UPDATE SET active_seq = excluded.active_seq, updated_at = excluded.updated_at
    `)
    .run(langKey, seq, ts);
}

// Exclusion inputs for the recommendation LLM: terms already in this feed plus
// recently-seen terms (and their template skeletons) for the same language pair.
export function buildExclusions(
  langKey: string,
  from: LangCode,
  to: LangCode,
  limit: number,
): { terms: string[]; templates: string[] } {
  const handle = getDb();
  const terms = new Set<string>();
  const templates = new Set<string>();

  const feedRows = handle
    .prepare("SELECT query, data_json FROM feed_items WHERE lang_key = ?")
    .all(langKey) as { query: string; data_json: string }[];
  for (const r of feedRows) {
    terms.add(r.query.trim().toLowerCase());
    try {
      const entry = JSON.parse(r.data_json) as LookupEntry;
      templates.add(templateSkeleton(entry.termSegments, entry.term));
    } catch {
      // Ignore malformed rows for exclusion purposes.
    }
  }

  const seenRows = handle
    .prepare(
      `SELECT term, term_segments_json FROM seen_log
       WHERE from_lang = ? AND to_lang = ?
       ORDER BY last_seen_at DESC LIMIT ?`,
    )
    .all(from, to, limit) as { term: string; term_segments_json: string | null }[];
  for (const r of seenRows) {
    terms.add(r.term.trim().toLowerCase());
    const segs = r.term_segments_json
      ? (JSON.parse(r.term_segments_json) as TermSegment[])
      : undefined;
    templates.add(templateSkeleton(segs, r.term));
  }

  return { terms: [...terms].slice(0, limit), templates: [...templates].slice(0, limit) };
}

// Keep the feed from growing unbounded: drop items well behind the cursor.
export function pruneBehind(langKey: string, activeSeq: number, keep: number): void {
  getDb()
    .prepare("DELETE FROM feed_items WHERE lang_key = ? AND seq < ?")
    .run(langKey, activeSeq - keep);
}
