"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { LangCode } from "../languages";
import { isDue, nextDueAt } from "../review";
import type { SavedEntry, SeenRecord } from "../types";

type DirtyKind = "entries" | "seenLog";
type SyncHooks = {
  markDirty: (kind: DirtyKind, id: string) => void;
  triggerSync: () => void;
};

let syncHooks: SyncHooks | null = null;
export function registerSyncHooks(hooks: SyncHooks): void {
  syncHooks = hooks;
}
function markDirty(kind: DirtyKind, id: string): void {
  syncHooks?.markDirty(kind, id);
  syncHooks?.triggerSync();
}

interface DreamDictDB extends DBSchema {
  entries: {
    key: string;
    value: SavedEntry;
    indexes: { "by-createdAt": number };
  };
  audioCache: {
    key: string;
    value: { hash: string; blob: Blob; createdAt: number };
  };
  seenLog: {
    key: string;
    value: SeenRecord;
    indexes: { "by-lastSeenAt": number };
  };
}

const DB_NAME = "dream-dict";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<DreamDictDB>> | null = null;

export function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<DreamDictDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "id" });
          store.createIndex("by-createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("audioCache")) {
          db.createObjectStore("audioCache", { keyPath: "hash" });
        }
        if (!db.objectStoreNames.contains("seenLog")) {
          const store = db.createObjectStore("seenLog", { keyPath: "id" });
          store.createIndex("by-lastSeenAt", "lastSeenAt");
        }
      },
    });
  }
  return dbPromise;
}

export async function saveEntry(entry: SavedEntry): Promise<void> {
  const db = await getDB();
  const now = Date.now();
  const stamped: SavedEntry = {
    ...entry,
    updatedAt: now,
    deleted: false,
    lastReviewedAt: entry.lastReviewedAt ?? entry.createdAt ?? now,
    reviewCount: entry.reviewCount ?? 0,
  };
  await db.put("entries", stamped);
  markDirty("entries", stamped.id);
}

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDB();
  const existing = await db.get("entries", id);
  if (!existing) return;
  const tombstone: SavedEntry = {
    ...existing,
    deleted: true,
    updatedAt: Date.now(),
  };
  await db.put("entries", tombstone);
  markDirty("entries", id);
}

export async function getEntry(id: string): Promise<SavedEntry | undefined> {
  const db = await getDB();
  const row = await db.get("entries", id);
  if (!row || row.deleted) return undefined;
  return row;
}

export async function listEntries(): Promise<SavedEntry[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("entries", "by-createdAt");
  return all.filter((e) => !e.deleted).reverse();
}

export async function getAudio(hash: string): Promise<Blob | undefined> {
  const db = await getDB();
  const row = await db.get("audioCache", hash);
  return row?.blob;
}

export async function putAudio(hash: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put("audioCache", { hash, blob, createdAt: Date.now() });
}

export function entryId(query: string, from: string, to: string): string {
  return `${from}->${to}::${query.trim().toLowerCase()}`;
}

type RecordSeenInput = Pick<SeenRecord, "id" | "query" | "from" | "to" | "term" | "termSegments">;

export async function recordSeen(input: RecordSeenInput): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("seenLog", "readwrite");
  const store = tx.objectStore("seenLog");
  const existing = await store.get(input.id);
  const now = Date.now();
  const next: SeenRecord = existing
    ? { ...existing, lastSeenAt: now, count: existing.count + 1, term: input.term, termSegments: input.termSegments }
    : {
        id: input.id,
        query: input.query,
        from: input.from,
        to: input.to,
        term: input.term,
        termSegments: input.termSegments,
        firstSeenAt: now,
        lastSeenAt: now,
        count: 1,
      };
  await store.put(next);
  await tx.done;
  markDirty("seenLog", input.id);
}

export async function listRecentSeen(limit = 200): Promise<SeenRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("seenLog", "by-lastSeenAt");
  return all.reverse().slice(0, limit);
}

export type ReviewOutcome = "pass" | "partial" | "fail";

export async function recordReviewResult(id: string, outcome: ReviewOutcome): Promise<void> {
  const db = await getDB();
  const existing = await db.get("entries", id);
  if (!existing || existing.deleted) return;
  const now = Date.now();
  const prevCount = existing.reviewCount ?? 0;
  // pass advances the SR ladder; partial holds position (re-shows at same interval);
  // fail resets to 0 so the entry comes back tomorrow.
  const reviewCount = outcome === "pass" ? prevCount + 1 : outcome === "fail" ? 0 : prevCount;
  const next: SavedEntry = {
    ...existing,
    lastReviewedAt: now,
    reviewCount,
    updatedAt: now,
  };
  await db.put("entries", next);
  markDirty("entries", id);
}

// Feed scroll-as-review path: scrolling a review card into view counts as a pass.
export async function recordReview(id: string): Promise<void> {
  await recordReviewResult(id, "pass");
}

export async function listDueReviews(opts: {
  from: LangCode;
  to: LangCode;
  now: number;
  limit: number;
}): Promise<SavedEntry[]> {
  const db = await getDB();
  const all = await db.getAll("entries");
  const due = all.filter(
    (e) => !e.deleted && e.from === opts.from && e.to === opts.to && isDue(e, opts.now),
  );
  due.sort((a, b) => nextDueAt(a) - nextDueAt(b));
  return due.slice(0, opts.limit);
}
