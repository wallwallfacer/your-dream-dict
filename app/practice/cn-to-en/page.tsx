"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Loader2, X, Check, CheckCheck, Sparkles } from "lucide-react";
import { listDueReviews, recordReviewResult, type ReviewOutcome } from "@/lib/db/notebook";
import { prewarmAudio, playAudio } from "@/lib/audio";
import { usePrefs } from "@/lib/prefs";
import type { SavedEntry } from "@/lib/types";
import { SegmentedText } from "@/components/SegmentedText";
import { SpeakButton } from "@/components/SpeakButton";

function nativePrompt(entry: SavedEntry): string {
  const fromExample = entry.data.examples?.[0]?.native;
  if (fromExample && fromExample.trim()) return fromExample.trim();
  const eq = entry.data.nativeEquivalents?.[0];
  if (eq && eq.trim()) return eq.trim();
  return entry.query;
}

export default function CnToEnPage() {
  const { from, to } = usePrefs();
  const [items, setItems] = useState<SavedEntry[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    listDueReviews({ from, to, now: Date.now(), limit: 50 })
      .then(setItems)
      .catch(() => setItems([]));
  }, [from, to]);

  const current = items?.[idx];

  // Pre-warm TTS for the current target so reveal-and-play is instant. Play
  // the FULL term (with concrete slot) so the audio matches what's revealed.
  useEffect(() => {
    if (!current) return;
    prewarmAudio(current.data.term, to);
  }, [current, to]);

  async function grade(outcome: ReviewOutcome) {
    if (!current || grading) return;
    setGrading(true);
    try {
      await recordReviewResult(current.id, outcome);
    } finally {
      setGrading(false);
      setRevealed(false);
      setIdx((i) => i + 1);
    }
  }

  function reveal() {
    if (!current) return;
    setRevealed(true);
    void playAudio(current.data.term, to).catch(() => {
      // ignore — silent fail is fine, user already saw the text
    });
  }

  if (items === null) {
    return (
      <div className="min-h-dvh bg-cream flex items-center justify-center text-ink/60">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  if (items.length === 0 || !current) {
    return (
      <div className="min-h-dvh bg-cream flex flex-col items-center justify-center px-6 text-center">
        <Sparkles className="text-sunshine mb-3" size={28} />
        <div className="text-ink font-extrabold text-xl">
          {items.length === 0 ? "Nothing due right now." : "全部完成 🎉"}
        </div>
        <div className="text-ink/60 text-sm mt-2">
          Reviews come back as they age into the next interval.
        </div>
        <Link
          href="/practice"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink text-cream px-4 py-2 font-semibold"
        >
          <ArrowLeft size={16} /> Back to Practice
        </Link>
      </div>
    );
  }

  const total = items.length;
  const progress = `${idx + 1} / ${total}`;
  const prompt = nativePrompt(current);

  return (
    <div className="min-h-dvh bg-cream flex flex-col">
      <header className="px-5 pt-safe pt-4 pb-2 flex items-center justify-between">
        <Link
          href="/practice"
          className="h-9 w-9 rounded-full bg-white shadow-sm ring-1 ring-black/5 flex items-center justify-center text-ink/70 active:scale-90 transition"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="text-xs font-semibold text-ink/60 tabular-nums">{progress}</div>
        <div className="h-9 w-9" />
      </header>

      <main className="flex-1 mx-auto max-w-md w-full px-5 flex flex-col">
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-black/5 p-6 mt-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">
            Say it in {current.to === "en" ? "English" : "Chinese"}
          </div>
          <p className="text-2xl font-extrabold text-ink leading-snug">{prompt}</p>
        </div>

        {!revealed ? (
          <button
            type="button"
            onClick={reveal}
            className="mt-6 rounded-3xl bg-ink text-cream py-4 font-extrabold text-base shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Eye size={18} /> Reveal answer
          </button>
        ) : (
          <>
            <div className="rounded-3xl bg-sunshine/30 ring-1 ring-sunshine/60 p-6 mt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink/50 mb-2">
                Target
              </div>
              <div className="text-xl font-extrabold text-ink leading-snug break-words">
                <SegmentedText
                  segments={current.data.termSegments}
                  fallback={current.data.term}
                  templateClass="text-coral"
                />
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {current.data.pronunciation && (
                  <span className="font-mono text-xs text-ink/60">
                    /{current.data.pronunciation}/
                  </span>
                )}
                <SpeakButton text={current.data.term} lang={to} size="sm" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <button
                type="button"
                disabled={grading}
                onClick={() => grade("fail")}
                className="rounded-2xl bg-coral/15 text-coral font-extrabold py-3 ring-1 ring-coral/30 active:scale-[0.97] transition disabled:opacity-50 flex flex-col items-center gap-1"
              >
                <X size={18} />
                <span className="text-sm">忘了</span>
              </button>
              <button
                type="button"
                disabled={grading}
                onClick={() => grade("partial")}
                className="rounded-2xl bg-sunshine/40 text-ink font-extrabold py-3 ring-1 ring-sunshine active:scale-[0.97] transition disabled:opacity-50 flex flex-col items-center gap-1"
              >
                <Check size={18} />
                <span className="text-sm">一半</span>
              </button>
              <button
                type="button"
                disabled={grading}
                onClick={() => grade("pass")}
                className="rounded-2xl bg-sky/20 text-sky font-extrabold py-3 ring-1 ring-sky/30 active:scale-[0.97] transition disabled:opacity-50 flex flex-col items-center gap-1"
              >
                <CheckCheck size={18} />
                <span className="text-sm">会</span>
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
