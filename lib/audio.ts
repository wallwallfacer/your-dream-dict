"use client";

import { getAudio, putAudio } from "./db/notebook";
import type { LangCode } from "./languages";
import type { TermSegment } from "./types";
import { withBasePath } from "./basePath";

function hashKey(text: string, lang: LangCode): string {
  // Plain string key — IndexedDB handles long strings fine, and we don't need crypto strength.
  // (crypto.subtle is unavailable on non-secure-origin pages, e.g. http://*.ts.net.)
  // v2: TTS now uses style instructions and replaces headline slots with a pause; old cached blobs would play the previous voicing.
  return `${lang}::v2::${text}`;
}

// Build TTS text for a sentence-pattern headline: replace each slot with " ... " so the
// model pauses on the variable position instead of reading a stale concrete fill.
export function headlineTtsText(entry: {
  term: string;
  termSegments?: TermSegment[];
}): string {
  const segs = entry.termSegments;
  if (!segs || segs.length === 0) return entry.term;
  const out = segs.map((s) => (s.kind === "slot" ? " ... " : s.text)).join("");
  return out.replace(/\s+/g, " ").trim();
}

const inflight = new Map<string, Promise<Blob>>();

async function fetchTTS(text: string, lang: LangCode): Promise<Blob> {
  const res = await fetch(withBasePath("/api/tts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  return res.blob();
}

export async function getOrFetchAudio(text: string, lang: LangCode): Promise<Blob> {
  const key = hashKey(text, lang);
  const cached = await getAudio(key);
  if (cached) return cached;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const blob = await fetchTTS(text, lang);
    await putAudio(key, blob);
    return blob;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

export function prewarmAudio(text: string, lang: LangCode): void {
  void getOrFetchAudio(text, lang).catch((e) => {
    console.warn("[audio] prewarm failed", e);
  });
}

export async function playAudio(text: string, lang: LangCode): Promise<void> {
  const blob = await getOrFetchAudio(text, lang);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  await audio.play();
}
