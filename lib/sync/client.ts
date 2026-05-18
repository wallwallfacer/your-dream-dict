"use client";

import { getDB, registerSyncHooks } from "../db/notebook";
import type { SavedEntry, SeenRecord } from "../types";
import { withBasePath } from "../basePath";

const PUSH_DEBOUNCE_MS = 1500;
const PULL_INTERVAL_MS = 60_000;
const LAST_PULL_KEY = "dream-dict:sync:lastPullAt";
const BOOTSTRAP_KEY = "dream-dict:sync:bootstrapDone";
const DIRTY_KEY = (kind: DirtyKind) => `dream-dict:sync:dirty:${kind}`;

type DirtyKind = "entries" | "seenLog";

type PullResponse = {
  entries: SavedEntry[];
  seenLog: SeenRecord[];
  serverNow: number;
};

let started = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pulling = false;
let pushing = false;

function readDirty(kind: DirtyKind): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DIRTY_KEY(kind));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}
function writeDirty(kind: DirtyKind, ids: string[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DIRTY_KEY(kind), JSON.stringify(ids));
}
function addDirty(kind: DirtyKind, id: string): void {
  const set = new Set(readDirty(kind));
  set.add(id);
  writeDirty(kind, [...set]);
}

function getLastPullAt(): number {
  if (typeof localStorage === "undefined") return 0;
  const raw = localStorage.getItem(LAST_PULL_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}
function setLastPullAt(t: number): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_PULL_KEY, String(t));
}

async function push(): Promise<void> {
  if (pushing) return;
  pushing = true;
  try {
    const entryIds = readDirty("entries");
    const seenIds = readDirty("seenLog");
    if (entryIds.length === 0 && seenIds.length === 0) return;

    const db = await getDB();
    const entries: SavedEntry[] = [];
    for (const id of entryIds) {
      const row = await db.get("entries", id);
      if (row) entries.push(row);
    }
    const seenLog: SeenRecord[] = [];
    for (const id of seenIds) {
      const row = await db.get("seenLog", id);
      if (row) seenLog.push(row);
    }

    const res = await fetch(withBasePath("/api/sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries, seenLog }),
    });
    if (!res.ok) throw new Error(`push failed: ${res.status}`);

    // Clear only the IDs we just pushed; new dirties added during the request stay queued.
    const pushedEntries = new Set(entryIds);
    const pushedSeen = new Set(seenIds);
    writeDirty(
      "entries",
      readDirty("entries").filter((id) => !pushedEntries.has(id)),
    );
    writeDirty(
      "seenLog",
      readDirty("seenLog").filter((id) => !pushedSeen.has(id)),
    );
  } catch (e) {
    console.warn("[sync] push failed; will retry", e);
  } finally {
    pushing = false;
  }
}

function triggerPush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    void push();
  }, PUSH_DEBOUNCE_MS);
}

async function pull(): Promise<void> {
  if (pulling) return;
  pulling = true;
  try {
    const since = getLastPullAt();
    const res = await fetch(withBasePath(`/api/sync?since=${since}`));
    if (!res.ok) throw new Error(`pull failed: ${res.status}`);
    const data = (await res.json()) as PullResponse;
    await mergeIntoLocal(data);
    setLastPullAt(data.serverNow);
  } catch (e) {
    console.warn("[sync] pull failed", e);
  } finally {
    pulling = false;
  }
}

async function mergeIntoLocal(data: PullResponse): Promise<void> {
  const db = await getDB();

  for (const remote of data.entries ?? []) {
    const local = await db.get("entries", remote.id);
    const localUpdated = local?.updatedAt ?? local?.createdAt ?? 0;
    const remoteUpdated = remote.updatedAt ?? remote.createdAt ?? 0;
    if (!local || remoteUpdated >= localUpdated) {
      await db.put("entries", remote);
    }
  }

  for (const remote of data.seenLog ?? []) {
    const local = await db.get("seenLog", remote.id);
    const localLast = local?.lastSeenAt ?? 0;
    if (!local || remote.lastSeenAt >= localLast) {
      await db.put("seenLog", {
        ...remote,
        firstSeenAt: Math.min(remote.firstSeenAt, local?.firstSeenAt ?? remote.firstSeenAt),
        count: Math.max(remote.count, local?.count ?? 0),
      });
    }
  }
}

async function bootstrapIfNeeded(): Promise<void> {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(BOOTSTRAP_KEY) === "1") return;
  try {
    const db = await getDB();
    const entries = await db.getAll("entries");
    const seenLog = await db.getAll("seenLog");
    for (const e of entries) addDirty("entries", e.id);
    for (const s of seenLog) addDirty("seenLog", s.id);
    localStorage.setItem(BOOTSTRAP_KEY, "1");
  } catch (e) {
    console.warn("[sync] bootstrap failed", e);
  }
}

export function startSync(): void {
  if (started) return;
  started = true;

  registerSyncHooks({
    markDirty: (kind, id) => addDirty(kind, id),
    triggerSync: () => triggerPush(),
  });

  // First run on this device: mark every existing local row dirty so the
  // server gets an initial mirror. Server upserts are idempotent under LWW.
  void bootstrapIfNeeded().then(() => triggerPush());

  void pull();

  setInterval(() => {
    void pull();
  }, PULL_INTERVAL_MS);

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void pull();
    });
  }
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void pull();
      triggerPush();
    });
  }
}
