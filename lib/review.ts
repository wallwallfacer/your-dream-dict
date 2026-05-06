import type { SavedEntry } from "./types";

export const INTERVAL_DAYS = [1, 3, 7, 14, 30, 90] as const;
const DAY_MS = 86_400_000;

export function nextDueAt(entry: SavedEntry): number {
  const reviewCount = entry.reviewCount ?? 0;
  // Never-reviewed entries are due immediately. After the 1st review the
  // INTERVAL_DAYS schedule kicks in (1d, 3d, 7d, ...).
  if (reviewCount === 0) return entry.createdAt;
  const base = entry.lastReviewedAt ?? entry.createdAt;
  const idx = Math.min(reviewCount - 1, INTERVAL_DAYS.length - 1);
  return base + INTERVAL_DAYS[idx] * DAY_MS;
}

export function isDue(entry: SavedEntry, now: number): boolean {
  if (entry.deleted) return false;
  return now >= nextDueAt(entry);
}
