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

export function ExampleSentence({ example, toLang, index }: Props) {
  // First example highlighted as the dark inkwell card; the rest as paper cards
  // with a thin editorial border. Keeps a clear visual hierarchy without
  // resorting to the old multi-color cycle.
  const featured = index === 0;
  return (
    <div
      className={
        featured
          ? "rounded-2xl bg-ink-deep p-4"
          : "rounded-2xl bg-paper border-[1.5px] border-line-soft p-4"
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {example.source && (
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.12em] mb-1.5 ${
                featured ? "text-vermilion-soft" : "text-vermilion"
              }`}
            >
              {example.source}
            </p>
          )}
          <p
            className={`font-serif text-[clamp(1.125rem,3.5vw,1.4rem)] leading-[1.2] break-words ${
              featured ? "text-paper" : "text-ink"
            }`}
          >
            <SegmentedText
              segments={example.targetSegments}
              fallback={example.target}
              templateClass={featured ? "text-vermilion-soft" : "text-vermilion"}
            />
          </p>
          <p
            className={`mt-1.5 text-[13px] leading-relaxed ${
              featured ? "text-muted-soft" : "text-body"
            }`}
            style={{ fontFamily: "var(--font-cn)" }}
          >
            {example.native}
          </p>
        </div>
        <SpeakButton
          text={example.target}
          lang={toLang}
          size="sm"
          className={
            featured
              ? "bg-paper/10 text-paper border-0"
              : "bg-paper text-ink border-[1.5px] border-line"
          }
        />
      </div>
    </div>
  );
}
