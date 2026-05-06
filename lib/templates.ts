import type { TermSegment } from "./types";

// Collapse a sentence to its template skeleton. Slot segments become "___" so
// "Could you walk me through the tradeoffs here?" → "could you walk me through ___?"
// Used to dedup recommendations across slot fills (and, with the right prompt
// wording, across surface paraphrases of the same template).
//
// Without segments we fall back to the lowercased full term — that entry just
// loses template-level dedup but still participates in sentence-level dedup.
export function templateSkeleton(
  segments: TermSegment[] | undefined,
  fallback: string,
): string {
  if (!segments || segments.length === 0) {
    return fallback.trim().toLowerCase();
  }
  const out = segments.map((s) => (s.kind === "template" ? s.text : "___")).join("");
  return out.replace(/\s+/g, " ").trim().toLowerCase();
}
