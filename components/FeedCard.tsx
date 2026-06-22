"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImageOff, Loader2, Heart, MessageCircle, Bookmark, Sparkles, BookHeart, ArrowUp } from "lucide-react";
import { motion } from "framer-motion";
import { SpeakButton } from "./SpeakButton";
import type { LangCode } from "@/lib/languages";
import type { LookupEntry } from "@/lib/types";
import { SegmentedText } from "./SegmentedText";
import { headlineTtsText } from "@/lib/audio";
import { clsx } from "clsx";

export type FeedItemStatus = "loading" | "ready" | "error";

export type FeedItem = {
  query: string;
  from: LangCode;
  to: LangCode;
  kind: "review" | "new";
  entry?: LookupEntry;
  imageDataUrl?: string;
  status: FeedItemStatus;
  error?: string;
};

type Props = {
  item: FeedItem;
  saved: boolean;
  onSave: () => void;
  onAsk: () => void;
  isFirst: boolean;
  isLast: boolean;
};

export function FeedCard({ item, saved, onSave, onAsk, isFirst, isLast }: Props) {
  const { entry, status, kind, to } = item;
  const exRef = useRef<HTMLDivElement>(null);
  const [exIdx, setExIdx] = useState(0);

  useEffect(() => {
    const el = exRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setExIdx((prev) => (prev !== idx ? idx : prev));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [entry?.examples.length]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-paper text-ink">
      {/* Loading overlay */}
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-ink gap-2">
          <Loader2 className="animate-spin" size={28} />
          <span className="text-sm text-muted">Cooking up something fun…</span>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-ink gap-3 px-8 text-center">
          <ImageOff size={28} />
          <div className="text-sm text-body">{item.error || "Couldn't load this one"}</div>
          <span className="text-xs text-muted">Swipe up to skip</span>
        </div>
      )}

      {status === "ready" && entry && (
        <>
          {/* Main content column. Padding-bottom leaves room for the bottom nav (~62px pill + safe-area). */}
          <div
            className="absolute inset-0 z-10 flex flex-col px-6 pt-safe"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
          >
            {/* Top label row with editorial 1.5px bottom rule */}
            <div className="flex items-center justify-between border-b-[1.5px] border-line pt-2 pb-2.5 flex-none">
              <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-ink inline-flex items-center gap-1.5">
                {kind === "review" ? (
                  <>
                    <BookHeart size={12} className="text-vermilion" /> Review · 复习
                  </>
                ) : (
                  <>
                    <Sparkles size={12} className="text-vermilion" /> New · 新词
                  </>
                )}
              </span>
              {isFirst && (
                <motion.span
                  initial={{ opacity: 0.6 }}
                  animate={{ opacity: [0.6, 0.2, 0.6] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-soft inline-flex items-center gap-1"
                >
                  swipe up <ArrowUp size={12} />
                </motion.span>
              )}
              {isLast && (
                <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-muted-soft">
                  loading more…
                </span>
              )}
            </div>

            {/* Hero: serif headline (Instrument Serif) */}
            <h1 className="font-serif font-normal text-[clamp(2rem,7vw,2.875rem)] leading-[1.05] tracking-[-0.01em] text-ink mt-5 break-words">
              <SegmentedText
                segments={entry.termSegments}
                fallback={entry.term}
                templateClass="text-vermilion"
                slotMode="label"
                slotClass="text-muted italic"
              />
            </h1>

            {/* Audio + IPA row */}
            <div className="mt-4 flex items-center gap-3 flex-none">
              <SpeakButton
                text={headlineTtsText(entry)}
                lang={to}
                size="md"
                className="bg-vermilion text-white border-0 shadow-none"
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
                {entry.partOfSpeech && (
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-soft">
                    {entry.partOfSpeech}
                  </span>
                )}
                {entry.pronunciation && (
                  <span className="font-mono text-[13px] text-muted truncate">
                    /{entry.pronunciation}/
                  </span>
                )}
              </div>
            </div>

            {/* Hairline divider */}
            <div className="h-px bg-line-soft my-5 flex-none" />

            {/* Meaning section */}
            <div className="flex-none">
              <div className="text-[11px] font-extrabold tracking-[0.12em] uppercase text-vermilion mb-2">
                释义 · Meaning
              </div>
              <p className="text-[15px] leading-[1.65] text-body line-clamp-4" style={{ fontFamily: "var(--font-cn)" }}>
                {entry.explanation}
              </p>

              {entry.nativeEquivalents && entry.nativeEquivalents.length > 0 && (
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {entry.nativeEquivalents.map((eq, i) => (
                    <span
                      key={i}
                      className="text-[13px] text-body border-[1.5px] border-tag-line rounded-lg px-3 py-1"
                      style={{ fontFamily: "var(--font-cn)" }}
                    >
                      {eq}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Spacer pushes the dark "in context" card to the bottom of the column */}
            <div className="flex-1 min-h-3" />

            {/* In context — dark inkwell card with swipeable examples */}
            {entry.examples.length > 0 && (
              <div className="flex-none">
                <div className="bg-ink-deep rounded-2xl px-4 py-4 max-w-[19rem]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-vermilion-soft">
                      In context{entry.examples[exIdx]?.source ? ` · ${entry.examples[exIdx].source}` : ""}
                    </div>
                    <SpeakButton
                      text={entry.examples[exIdx]?.target ?? ""}
                      lang={to}
                      size="sm"
                      className="bg-paper/10 text-paper border-0 shadow-none"
                    />
                  </div>
                  <div
                    ref={exRef}
                    className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
                    style={{ scrollSnapType: "x mandatory" }}
                  >
                    {entry.examples.map((ex, i) => (
                      <div key={i} className="snap-start shrink-0 w-full">
                        <p className="font-serif text-[22px] leading-[1.2] text-paper break-words">
                          <SegmentedText
                            segments={ex.targetSegments}
                            fallback={ex.target}
                            templateClass="text-vermilion-soft"
                          />
                        </p>
                        <p
                          className="mt-1.5 text-[13px] leading-snug text-muted-soft"
                          style={{ fontFamily: "var(--font-cn)" }}
                        >
                          {ex.native}
                        </p>
                      </div>
                    ))}
                  </div>
                  {entry.examples.length > 1 && (
                    <div className="mt-2.5 flex gap-1.5">
                      {entry.examples.map((_, i) => (
                        <span
                          key={i}
                          className={clsx(
                            "h-1 rounded-full transition-all",
                            i === exIdx ? "w-5 bg-paper" : "w-1.5 bg-paper/40",
                          )}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Floating right action rail — cream circles with thin black border */}
          <div
            className="absolute right-4 z-20 flex flex-col items-center gap-4"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 7.5rem)" }}
          >
            <button
              type="button"
              onClick={onSave}
              aria-label={saved ? "Remove from notebook" : "Save to notebook"}
              className="h-12 w-12 rounded-full bg-paper border-[1.5px] border-line flex items-center justify-center transition active:scale-90"
            >
              <Heart
                size={20}
                className={saved ? "text-vermilion" : "text-vermilion"}
                fill={saved ? "currentColor" : "none"}
                strokeWidth={2}
              />
            </button>
            <button
              type="button"
              onClick={onAsk}
              aria-label="Ask about this word"
              className="h-12 w-12 rounded-full bg-paper border-[1.5px] border-line flex items-center justify-center text-ink transition active:scale-90"
            >
              <MessageCircle size={20} strokeWidth={2} />
            </button>
            <Link
              href={`/lookup?q=${encodeURIComponent(item.query)}&from=${item.from}&to=${item.to}`}
              aria-label="See full entry"
              className="h-12 w-12 rounded-full bg-paper border-[1.5px] border-line flex items-center justify-center text-ink transition active:scale-90"
            >
              <Bookmark size={20} strokeWidth={2} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
