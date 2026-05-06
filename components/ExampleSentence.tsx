"use client";

import { SpeakButton } from "./SpeakButton";
import { SegmentedText } from "./SegmentedText";
import type { LangCode } from "@/lib/languages";
import type { LookupExample } from "@/lib/types";

type Props = {
  example: LookupExample;
  toLang: LangCode;
  index: number;
};

const ACCENTS = ["bg-sunshine", "bg-mint", "bg-sky", "bg-coral"];

export function ExampleSentence({ example, toLang, index }: Props) {
  const accent = ACCENTS[index % ACCENTS.length];
  return (
    <div className={`rounded-3xl ${accent} p-4 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold text-ink leading-snug break-words">
            <SegmentedText
              segments={example.targetSegments}
              fallback={example.target}
              templateClass="text-coral"
            />
          </p>
          <p className="mt-1.5 text-sm text-ink/70 leading-relaxed">{example.native}</p>
          {example.source && (
            <p className="mt-1.5 text-xs text-ink/60 italic">— {example.source}</p>
          )}
        </div>
        <SpeakButton text={example.target} lang={toLang} size="md" className="bg-white" />
      </div>
    </div>
  );
}
