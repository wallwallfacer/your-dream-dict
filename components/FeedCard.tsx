"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImageOff, Loader2, Heart, MessageCircle, Sparkles, BookHeart, ArrowUp } from "lucide-react";
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
  const { entry, imageDataUrl, status, kind, to } = item;
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
    <div className="relative h-full w-full overflow-hidden bg-ink">
      {/* Image background */}
      <div className="absolute inset-0 bg-gradient-to-br from-sunshine via-coral to-berry">
        {imageDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageDataUrl}
            alt={entry?.term ?? ""}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" />
      </div>

      {/* Top tag */}
      <div className="absolute top-0 inset-x-0 z-20 pt-safe">
        <div className="flex justify-center pt-3">
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow",
              kind === "review" ? "bg-sky text-cream" : "bg-sunshine text-ink",
            )}
          >
            {kind === "review" ? (
              <>
                <BookHeart size={12} /> Review
              </>
            ) : (
              <>
                <Sparkles size={12} /> New for you
              </>
            )}
          </span>
        </div>
      </div>

      {/* Loading overlay */}
      {status === "loading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-cream gap-2">
          <Loader2 className="animate-spin" size={32} />
          <span className="text-sm opacity-80">Cooking up something fun…</span>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-cream gap-3 px-8 text-center">
          <ImageOff size={32} />
          <div className="text-sm opacity-80">{item.error || "Couldn't load this one"}</div>
          <span className="text-xs opacity-60">Swipe up to skip</span>
        </div>
      )}

      {/* Content: text + right rail in one flex row, both anchored above the bottom nav.
          paddingBottom = nav pill (~62px) + breathing (~30px) + device safe-area, so content never bleeds under the nav on any phone. */}
      {status === "ready" && entry && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 px-4 flex items-end gap-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
        >
          <div className="flex-1 min-w-0 text-cream">
            <h2 className="text-[1.6rem] font-extrabold leading-[1.2] break-words drop-shadow-lg">
              <SegmentedText
                segments={entry.termSegments}
                fallback={entry.term}
                templateClass="text-sunshine"
                slotMode="label"
                slotClass="text-cream/65 italic"
              />
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {entry.partOfSpeech && (
                <span className="rounded-full bg-white/15 backdrop-blur px-2 py-0.5 text-xs font-semibold">
                  {entry.partOfSpeech}
                </span>
              )}
              {entry.pronunciation && (
                <span className="font-mono opacity-90 text-xs">/{entry.pronunciation}/</span>
              )}
              <SpeakButton text={headlineTtsText(entry)} lang={to} size="sm" />
            </div>

            <p className="mt-3 text-[15px] leading-relaxed line-clamp-3 drop-shadow">
              {entry.explanation}
            </p>

            {entry.nativeEquivalents && entry.nativeEquivalents.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {entry.nativeEquivalents.map((eq, i) => (
                  <span
                    key={i}
                    className="text-xs rounded-full bg-sunshine/90 text-ink px-2 py-0.5 font-semibold shadow"
                  >
                    {eq}
                  </span>
                ))}
              </div>
            )}

            {entry.examples.length > 0 && (
              <div className="mt-3">
                <div
                  ref={exRef}
                  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
                  style={{ scrollSnapType: "x mandatory" }}
                >
                  {entry.examples.map((ex, i) => (
                    <div
                      key={i}
                      className="snap-start shrink-0 w-full pr-2 last:pr-0"
                    >
                      <div className="rounded-2xl bg-black/35 backdrop-blur-md p-3 ring-1 ring-white/15">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold leading-snug break-words">
                              <SegmentedText
                                segments={ex.targetSegments}
                                fallback={ex.target}
                                templateClass="text-sunshine"
                              />
                            </p>
                            <p className="mt-1 text-sm opacity-85">{ex.native}</p>
                            {ex.source && (
                              <p className="mt-1.5 text-[11px] opacity-65 italic">
                                — {ex.source}
                              </p>
                            )}
                          </div>
                          <SpeakButton
                            text={ex.target}
                            lang={to}
                            size="sm"
                            className="bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {entry.examples.length > 1 && (
                  <div className="mt-2 flex justify-center gap-1.5">
                    {entry.examples.map((_, i) => (
                      <span
                        key={i}
                        className={clsx(
                          "h-1.5 rounded-full transition-all",
                          i === exIdx ? "w-5 bg-cream" : "w-1.5 bg-cream/40",
                        )}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 shrink-0">
            <button
              type="button"
              onClick={onSave}
              aria-label={saved ? "Remove from notebook" : "Save to notebook"}
              className={clsx(
                "h-12 w-12 rounded-full flex items-center justify-center shadow-xl transition active:scale-90",
                saved ? "bg-coral text-cream" : "bg-white text-ink",
              )}
            >
              <Heart size={20} fill={saved ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={onAsk}
              aria-label="Ask about this word"
              className="h-12 w-12 rounded-full bg-berry text-cream flex items-center justify-center shadow-xl transition active:scale-90"
            >
              <MessageCircle size={20} />
            </button>
            <Link
              href={`/lookup?q=${encodeURIComponent(item.query)}&from=${item.from}&to=${item.to}`}
              aria-label="See full entry"
              className="h-12 w-12 rounded-full bg-white text-ink flex items-center justify-center shadow-xl transition active:scale-90 text-[10px] font-bold tracking-wide"
            >
              MORE
            </Link>
          </div>
        </div>
      )}

      {/* Swipe hint (first card only) — sits above the rail/text block */}
      {isFirst && status === "ready" && (
        <motion.div
          initial={{ opacity: 0.7 }}
          animate={{ opacity: [0.7, 0.25, 0.7] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute left-1/2 top-20 -translate-x-1/2 z-30 text-cream/80 text-xs flex flex-col items-center gap-1 pointer-events-none"
        >
          <ArrowUp size={16} />
          <span>swipe up</span>
        </motion.div>
      )}

      {isLast && status === "ready" && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 z-30 text-cream/70 text-xs pointer-events-none">
          loading more…
        </div>
      )}
    </div>
  );
}
