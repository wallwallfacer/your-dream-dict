"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mic, Volume2, RotateCcw, ChevronRight, Check, X, Sparkles, AlertTriangle } from "lucide-react";
import { listDueReviews, recordReviewResult } from "@/lib/db/notebook";
import { prewarmAudio, playAudio } from "@/lib/audio";
import { useRecorder, type RecordingResult } from "@/lib/hooks/useRecorder";
import { usePrefs } from "@/lib/prefs";
import type { SavedEntry } from "@/lib/types";
import { SegmentedText } from "@/components/SegmentedText";
import { withBasePath } from "@/lib/basePath";

const MAX_RECORD_MS = 10_000;

type ShadowingResult = {
  passed: boolean;
  wordsMatch: boolean;
  prosodyScore: number;
  transcript: string;
  feedback: string;
};

type Phase = "ready" | "recording" | "uploading" | "result";

export default function ShadowingPage() {
  const { from, to } = usePrefs();
  const [items, setItems] = useState<SavedEntry[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("ready");
  const [result, setResult] = useState<ShadowingResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const recorder = useRecorder();
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listDueReviews({ from, to, now: Date.now(), limit: 50 })
      .then(setItems)
      .catch(() => setItems([]));
  }, [from, to]);

  const current = items?.[idx];

  // Pre-warm TTS for current + next so Listen plays instantly. Use the FULL
  // term (with concrete slot text) — shadowing requires the user to reproduce
  // the entire sentence, not the abstract template.
  useEffect(() => {
    if (!current) return;
    prewarmAudio(current.data.term, to);
    const next = items?.[idx + 1];
    if (next) prewarmAudio(next.data.term, to);
  }, [current, items, idx, to]);

  // Reset state when item changes (React's "adjusting state during render" pattern).
  const prevIdxRef = useRef(idx);
  if (prevIdxRef.current !== idx) {
    prevIdxRef.current = idx;
    setPhase("ready");
    setResult(null);
    setErrorMsg(null);
  }

  // Cleanup on unmount
  useEffect(() => () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
  }, []);

  function listen() {
    if (!current) return;
    void playAudio(current.data.term, to).catch((e) =>
      console.warn("[shadowing] play failed", e),
    );
  }

  async function startHold() {
    if (!current || phase !== "ready") return;
    setErrorMsg(null);
    await recorder.start();
    setPhase("recording");
    stopTimerRef.current = setTimeout(() => {
      void stopAndGrade();
    }, MAX_RECORD_MS);
  }

  async function stopAndGrade() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (phase !== "recording") return;
    setPhase("uploading");
    const rec = await recorder.stop();
    if (!rec || !current) {
      setPhase("ready");
      return;
    }
    await grade(rec);
  }

  async function grade(rec: RecordingResult) {
    if (!current) return;
    try {
      const fd = new FormData();
      const ext = rec.mimeType.includes("mp4") ? "m4a" : "webm";
      fd.append("audio", new File([rec.blob], `take.${ext}`, { type: rec.mimeType }));
      fd.append("targetText", current.data.term);
      fd.append("from", current.from);
      fd.append("to", current.to);
      const res = await fetch(withBasePath("/api/practice/shadowing/grade"), { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Grade failed (${res.status})`);
      }
      const data = (await res.json()) as ShadowingResult;
      setResult(data);
      setPhase("result");
      if (data.passed) {
        await recordReviewResult(current.id, "pass");
        setTimeout(() => advance(), 1500);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Grade failed");
      setPhase("ready");
    }
  }

  function advance() {
    setIdx((i) => i + 1);
  }

  async function skip() {
    if (!current) return;
    await recordReviewResult(current.id, "fail");
    advance();
  }

  function retake() {
    setResult(null);
    setErrorMsg(null);
    setPhase("ready");
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
  const passResult = phase === "result" && result?.passed === true;
  const failResult = phase === "result" && result?.passed === false;

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
            Read it back, exactly
          </div>
          <p className="text-2xl font-extrabold text-ink leading-snug break-words">
            <SegmentedText
              segments={current.data.termSegments}
              fallback={current.data.term}
              templateClass="text-coral"
            />
          </p>
          {current.data.pronunciation && (
            <p className="mt-3 font-mono text-sm text-ink/60">/{current.data.pronunciation}/</p>
          )}
          <button
            type="button"
            onClick={listen}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-sunshine text-ink px-4 py-2 text-sm font-bold shadow-sm active:scale-95 transition"
          >
            <Volume2 size={16} /> Listen
          </button>
        </div>

        {recorder.state === "denied" && (
          <div className="mt-4 rounded-2xl bg-coral/15 ring-1 ring-coral/30 text-coral p-3 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              Microphone permission denied. Enable it in browser settings to use shadowing.
            </span>
          </div>
        )}
        {errorMsg && (
          <div className="mt-4 rounded-2xl bg-coral/15 ring-1 ring-coral/30 text-coral p-3 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {phase === "result" && result && (
          <div
            className={`mt-4 rounded-3xl p-5 ring-1 ${
              passResult
                ? "bg-sky/15 ring-sky/40 text-ink"
                : "bg-coral/10 ring-coral/30 text-ink"
            }`}
          >
            <div className="flex items-center gap-2">
              {passResult ? (
                <span className="h-8 w-8 rounded-full bg-sky text-cream flex items-center justify-center">
                  <Check size={18} />
                </span>
              ) : (
                <span className="h-8 w-8 rounded-full bg-coral text-cream flex items-center justify-center">
                  <X size={18} />
                </span>
              )}
              <span className="font-extrabold text-lg">
                {passResult ? "Nailed it" : result.wordsMatch ? "Words OK, prosody off" : "Words off"}
              </span>
              <span className="ml-auto text-xs font-mono text-ink/60">
                prosody {Math.round(result.prosodyScore * 100)}%
              </span>
            </div>
            {result.transcript && (
              <div className="mt-3 text-sm text-ink/80">
                <div className="text-xs uppercase tracking-wider text-ink/40 mb-1">
                  You said
                </div>
                <div className="break-words">{result.transcript}</div>
              </div>
            )}
            {result.feedback && (
              <div className="mt-3 text-sm text-ink/80">
                <div className="text-xs uppercase tracking-wider text-ink/40 mb-1">
                  Coach
                </div>
                <div className="break-words">{result.feedback}</div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-md w-full px-5 pb-safe pb-6">
        {phase === "ready" && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              void startHold();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              void stopAndGrade();
            }}
            onPointerCancel={() => recorder.cancel()}
            className="w-full rounded-3xl bg-coral text-cream py-5 font-extrabold text-base shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Mic size={18} /> Hold to record
          </button>
        )}
        {phase === "recording" && (
          <button
            type="button"
            onPointerUp={(e) => {
              e.preventDefault();
              void stopAndGrade();
            }}
            onPointerCancel={() => recorder.cancel()}
            className="w-full rounded-3xl bg-coral text-cream py-5 font-extrabold text-base shadow-md flex items-center justify-center gap-2 animate-pulse"
          >
            <Mic size={18} /> Recording — release to grade
          </button>
        )}
        {phase === "uploading" && (
          <div className="w-full rounded-3xl bg-ink/80 text-cream py-5 font-extrabold text-base flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={18} /> Listening…
          </div>
        )}
        {failResult && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={retake}
              className="rounded-3xl bg-white text-ink ring-1 ring-black/10 py-4 font-extrabold shadow-sm active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} /> 再来一次
            </button>
            <button
              type="button"
              onClick={() => void skip()}
              className="rounded-3xl bg-ink text-cream py-4 font-extrabold shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              跳过 <ChevronRight size={16} />
            </button>
          </div>
        )}
        {passResult && (
          <div className="w-full rounded-3xl bg-sky/15 text-sky py-4 font-extrabold text-center">
            Next…
          </div>
        )}
      </footer>
    </div>
  );
}
