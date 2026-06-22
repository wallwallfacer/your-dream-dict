"use client";

import { SpeakButton } from "./SpeakButton";
import type { LangCode } from "@/lib/languages";
import type { LookupEntry } from "@/lib/types";
import { SegmentedText } from "./SegmentedText";
import { headlineTtsText } from "@/lib/audio";

type Props = {
  entry: LookupEntry;
  toLang: LangCode;
};

export function EntryCard({ entry, toLang }: Props) {
  return (
    <section className="border-[1.5px] border-line rounded-2xl bg-paper p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="font-serif font-normal text-[clamp(1.75rem,5vw,2.25rem)] leading-[1.05] tracking-[-0.01em] text-ink break-words">
            <SegmentedText
              segments={entry.termSegments}
              fallback={entry.term}
              templateClass="text-vermilion"
              slotMode="label"
              slotClass="text-muted italic"
            />
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {entry.partOfSpeech && (
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-soft">
                {entry.partOfSpeech}
              </span>
            )}
            {entry.pronunciation && (
              <span className="font-mono text-[13px] text-muted">/{entry.pronunciation}/</span>
            )}
          </div>
        </div>
        <SpeakButton text={headlineTtsText(entry)} lang={toLang} size="lg" />
      </div>
    </section>
  );
}
