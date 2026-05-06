"use client";

import type { ReactNode } from "react";
import type { TermSegment } from "@/lib/types";

type Props = {
  segments?: TermSegment[];
  fallback: string;
  templateClass: string;
  // "concrete" → render slot.text as-is (used for example sentences).
  // "label" → render `[slot.label ?? slot.text]` so the headline reads as an abstract template.
  slotMode?: "concrete" | "label";
  slotClass?: string;
};

// Trim punctuation (and surrounding whitespace) at segment edges so a sentence-final "?" or a
// comma adjacent to a slot doesn't carry the template highlight color. Internal punctuation
// (e.g. the apostrophe in "we're", the comma in "track, is") sits inside the middle slice and
// stays template-colored.
const LEADING_TRIM = /^[\s\p{P}]+/u;
const TRAILING_TRIM = /[\s\p{P}]+$/u;

function renderTemplate(
  text: string,
  exposedStart: boolean,
  exposedEnd: boolean,
  templateClass: string,
  key: number,
): ReactNode {
  const lead = text.match(LEADING_TRIM)?.[0] ?? "";
  const rest = text.slice(lead.length);
  // Whole segment is punctuation/whitespace: neutral if either end is exposed.
  if (rest === "") {
    const cls = exposedStart || exposedEnd ? "" : templateClass;
    return (
      <span key={key} className={cls}>
        {text}
      </span>
    );
  }
  const tail = rest.match(TRAILING_TRIM)?.[0] ?? "";
  const middle = tail ? rest.slice(0, -tail.length) : rest;
  return (
    <span key={key}>
      {lead && <span className={exposedStart ? "" : templateClass}>{lead}</span>}
      {middle && <span className={templateClass}>{middle}</span>}
      {tail && <span className={exposedEnd ? "" : templateClass}>{tail}</span>}
    </span>
  );
}

export function SegmentedText({
  segments,
  fallback,
  templateClass,
  slotMode = "concrete",
  slotClass,
}: Props) {
  if (!segments || segments.length === 0) return <>{fallback}</>;
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "slot") {
          if (slotMode === "label") {
            return (
              <span key={i} className={slotClass}>
                [{seg.label ?? seg.text}]
              </span>
            );
          }
          return <span key={i}>{seg.text}</span>;
        }
        const prev = segments[i - 1];
        const next = segments[i + 1];
        const exposedStart = !prev || prev.kind === "slot";
        const exposedEnd = !next || next.kind === "slot";
        return renderTemplate(seg.text, exposedStart, exposedEnd, templateClass, i);
      })}
    </>
  );
}
