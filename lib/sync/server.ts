import "server-only";
import Database, { type Database as DB } from "better-sqlite3";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import type { LangCode } from "../languages";
import type { LookupEntry, SavedEntry, SeenRecord, TermSegment } from "../types";

export type ServerEntry = SavedEntry & {
  updatedAt: number;
  deleted?: boolean;
};

export type SyncPayload = {
  entries?: ServerEntry[];
  seenLog?: SeenRecord[];
};

export type PullResult = {
  entries: ServerEntry[];
  seenLog: SeenRecord[];
  serverNow: number;
};

const DB_PATH =
  process.env.DREAM_DICT_DB_PATH ??
  path.join(os.homedir(), ".dream-dict", "dream-dict.sqlite");

let _db: DB | null = null;
function db(): DB {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const handle = new Database(DB_PATH);
  handle.pragma("journal_mode = WAL");
  handle.pragma("foreign_keys = ON");
  handle.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      from_lang TEXT NOT NULL,
      to_lang TEXT NOT NULL,
      data_json TEXT NOT NULL,
      image_data_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at INTEGER,
      review_count INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_entries_updated ON entries(updated_at);

    CREATE TABLE IF NOT EXISTS seen_log (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      from_lang TEXT NOT NULL,
      to_lang TEXT NOT NULL,
      term TEXT NOT NULL,
      term_segments_json TEXT,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      count INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_seen_updated ON seen_log(last_seen_at);

    -- Shared, server-authoritative feed: one ordered stream + one cursor per
    -- language pair (lang_key = "<from>-<to>"). Streamed to all browsers via SSE.
    CREATE TABLE IF NOT EXISTS feed_items (
      id TEXT PRIMARY KEY,
      lang_key TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      query TEXT NOT NULL,
      from_lang TEXT NOT NULL,
      to_lang TEXT NOT NULL,
      data_json TEXT NOT NULL,
      image_data_url TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feed_lang_seq ON feed_items(lang_key, seq);

    CREATE TABLE IF NOT EXISTS feed_cursor (
      lang_key TEXT PRIMARY KEY,
      active_seq INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  ensureColumn(handle, "entries", "last_reviewed_at", "INTEGER");
  ensureColumn(handle, "entries", "review_count", "INTEGER");
  _db = handle;
  return _db;
}

// Shared accessor for the single in-process SQLite handle (same WAL connection),
// used by the feed modules in lib/feed/*.
export function getDb(): DB {
  return db();
}

type PragmaColumn = { name: string };
function ensureColumn(handle: DB, table: string, column: string, decl: string): void {
  const cols = handle.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumn[];
  if (cols.some((c) => c.name === column)) return;
  handle.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

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

type SeenRow = {
  id: string;
  query: string;
  from_lang: string;
  to_lang: string;
  term: string;
  term_segments_json: string | null;
  first_seen_at: number;
  last_seen_at: number;
  count: number;
};

function rowToEntry(r: EntryRow): ServerEntry {
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

function rowToSeen(r: SeenRow): SeenRecord {
  return {
    id: r.id,
    query: r.query,
    from: r.from_lang as LangCode,
    to: r.to_lang as LangCode,
    term: r.term,
    termSegments: r.term_segments_json
      ? (JSON.parse(r.term_segments_json) as TermSegment[])
      : undefined,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    count: r.count,
  };
}

export function pullSince(since: number): PullResult {
  const handle = db();
  const entryRows = handle
    .prepare("SELECT * FROM entries WHERE updated_at > ? ORDER BY updated_at")
    .all(since) as EntryRow[];
  const seenRows = handle
    .prepare("SELECT * FROM seen_log WHERE last_seen_at > ? ORDER BY last_seen_at")
    .all(since) as SeenRow[];
  return {
    entries: entryRows.map(rowToEntry),
    seenLog: seenRows.map(rowToSeen),
    serverNow: Date.now(),
  };
}

export function pushBatch(payload: SyncPayload): {
  applied: { entries: number; seenLog: number };
} {
  const handle = db();
  const entries = payload.entries ?? [];
  const seenLog = payload.seenLog ?? [];

  const upEntry = handle.prepare(`
    INSERT INTO entries (id, query, from_lang, to_lang, data_json, image_data_url, created_at, updated_at, deleted, last_reviewed_at, review_count)
    VALUES (@id, @query, @fromLang, @toLang, @dataJson, @imageDataUrl, @createdAt, @updatedAt, @deleted, @lastReviewedAt, @reviewCount)
    ON CONFLICT(id) DO UPDATE SET
      query = excluded.query,
      from_lang = excluded.from_lang,
      to_lang = excluded.to_lang,
      data_json = excluded.data_json,
      image_data_url = excluded.image_data_url,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted,
      last_reviewed_at = excluded.last_reviewed_at,
      review_count = excluded.review_count
    WHERE excluded.updated_at > entries.updated_at
  `);

  const upSeen = handle.prepare(`
    INSERT INTO seen_log (id, query, from_lang, to_lang, term, term_segments_json, first_seen_at, last_seen_at, count)
    VALUES (@id, @query, @fromLang, @toLang, @term, @segs, @firstSeenAt, @lastSeenAt, @count)
    ON CONFLICT(id) DO UPDATE SET
      term = excluded.term,
      term_segments_json = excluded.term_segments_json,
      last_seen_at = MAX(excluded.last_seen_at, seen_log.last_seen_at),
      first_seen_at = MIN(excluded.first_seen_at, seen_log.first_seen_at),
      count = MAX(excluded.count, seen_log.count)
  `);

  const tx = handle.transaction(() => {
    for (const e of entries) {
      upEntry.run({
        id: e.id,
        query: e.query,
        fromLang: e.from,
        toLang: e.to,
        dataJson: JSON.stringify(e.data),
        imageDataUrl: e.imageDataUrl ?? null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt ?? e.createdAt,
        deleted: e.deleted ? 1 : 0,
        lastReviewedAt: e.lastReviewedAt ?? null,
        reviewCount: e.reviewCount ?? null,
      });
    }
    for (const s of seenLog) {
      upSeen.run({
        id: s.id,
        query: s.query,
        fromLang: s.from,
        toLang: s.to,
        term: s.term,
        segs: s.termSegments ? JSON.stringify(s.termSegments) : null,
        firstSeenAt: s.firstSeenAt,
        lastSeenAt: s.lastSeenAt,
        count: s.count,
      });
    }
  });
  tx();

  return { applied: { entries: entries.length, seenLog: seenLog.length } };
}
