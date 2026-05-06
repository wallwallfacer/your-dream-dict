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
    <section className="rounded-3xl bg-white shadow-xl ring-1 ring-black/5 p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-extrabold leading-snug break-words text-ink">
            <SegmentedText
              segments={entry.termSegments}
              fallback={entry.term}
              templateClass="text-coral"
              slotMode="label"
              slotClass="text-ink/45 italic"
            />
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/70">
            {entry.partOfSpeech && (
              <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold">
                {entry.partOfSpeech}
              </span>
            )}
            {entry.pronunciation && <span className="font-mono">/{entry.pronunciation}/</span>}
          </div>
        </div>
        <SpeakButton text={headlineTtsText(entry)} lang={toLang} size="lg" />
      </div>
    </section>
  );
}
