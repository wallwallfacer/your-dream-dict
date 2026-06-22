import { renderPrompt } from "./config";
import { callText } from "./text";
import { lang, type LangCode } from "../languages";
import type { LookupEntry, TermSegment } from "../types";

export function buildLookupPrompt(query: string, from: LangCode, to: LangCode): string {
  const native = lang(from);
  const target = lang(to);
  return renderPrompt("lookup", {
    nativeLabel: native.label,
    targetLabel: target.label,
    query,
    partOfSpeechHint: native.code === "zh" ? "句式" : "sentence pattern",
  });
}

export async function callLookup(
  query: string,
  from: LangCode,
  to: LangCode,
): Promise<LookupEntry> {
  const prompt = buildLookupPrompt(query, from, to);
  const text = await callText({ route: "lookup", user: prompt, jsonMode: true });
  return parseEntry(text);
}

function parseEntry(text: string): LookupEntry {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const obj = JSON.parse(cleaned) as LookupEntry;
  if (!obj.term || !Array.isArray(obj.examples) || obj.examples.length === 0) {
    throw new Error("Lookup response is missing required fields");
  }
  obj.termSegments = sanitizeSegments(obj.termSegments, obj.term);
  obj.examples = obj.examples.slice(0, 4).map((ex) => ({
    target: ex.target,
    native: ex.native,
    source: ex.source && ex.source.trim() ? ex.source.trim() : undefined,
    targetSegments: sanitizeSegments(ex.targetSegments, ex.target),
  }));
  obj.related = Array.isArray(obj.related) ? obj.related.slice(0, 4) : [];
  obj.nativeEquivalents = Array.isArray(obj.nativeEquivalents)
    ? obj.nativeEquivalents.filter((s) => typeof s === "string" && s.trim()).slice(0, 4)
    : [];
  return obj;
}

function sanitizeSegments(
  raw: TermSegment[] | undefined,
  fullText: string,
): TermSegment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const cleaned: TermSegment[] = [];
  for (const seg of raw) {
    if (!seg || typeof seg.text !== "string") return undefined;
    if (seg.kind !== "template" && seg.kind !== "slot") return undefined;
    if (seg.text.length === 0) continue;
    const label =
      seg.kind === "slot" && typeof seg.label === "string" && seg.label.trim()
        ? seg.label.trim()
        : undefined;
    cleaned.push({ text: seg.text, kind: seg.kind, ...(label ? { label } : {}) });
  }
  if (cleaned.length === 0) return undefined;
  // Concatenated text must reproduce fullText exactly; otherwise drop segments
  // rather than render something that doesn't match the headword.
  const joined = cleaned.map((s) => s.text).join("");
  if (joined !== fullText) return undefined;
  return cleaned;
}
