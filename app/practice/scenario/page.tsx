"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Mic,
  RotateCcw,
  ChevronRight,
  Check,
  X,
  Sparkles,
  AlertTriangle,
  Eye,
} from "lucide-react";
import { listDueReviews, recordReviewResult } from "@/lib/db/notebook";
import { useRecorder, type RecordingResult } from "@/lib/hooks/useRecorder";
import { usePrefs } from "@/lib/prefs";
import type { SavedEntry } from "@/lib/types";
import { withBasePath } from "@/lib/basePath";

const MAX_RECORD_MS = 30_000;

type ScenarioResult = {
  passed: boolean;
  transcript: string;
  usedTemplate: boolean;
  fitsScene: boolean;
  naturalness: number;
  feedback: string;
};

type Phase = "fetching" | "ready" | "recording" | "uploading" | "result";

function templateTextFor(entry: SavedEntry): string {
  const segs = entry.data.termSegments;
  if (!segs || segs.length === 0) return entry.data.term;
  const parts = segs
    .filter((s) => s.kind === "template")
    .map((s) => s.text.trim())
    .filter(Boolean);
  if (parts.length === 0) return entry.data.term;
  return parts.join(" ___ ");
}

function slotLabelsFor(entry: SavedEntry): string {
  const segs = entry.data.termSegments;
  if (!segs) return "";
  const labels = segs
    .filter((s) => s.kind === "slot")
    .map((s) => (s.label ?? s.text).trim())
    .filter(Boolean);
  return labels.join("、");
}

export default function ScenarioPage() {
  const { from, to } = usePrefs();
  const [items, setItems] = useState<SavedEntry[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [scenario, setScenario] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("fetching");
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPattern, setShowPattern] = useState(false);
  const recorder = useRecorder();
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listDueReviews({ from, to, now: Date.now(), limit: 50 })
      .then(setItems)
      .catch(() => setItems([]));
  }, [from, to]);

  const current = items?.[idx];

  // Reset state when item changes (React's "adjusting state during render" pattern),
  // then a separate effect kicks off the scenario fetch for the new item.
  const prevIdxRef = useRef(idx);
  if (prevIdxRef.current !== idx) {
    prevIdxRef.current = idx;
    setPhase("fetching");
    setScenario("");
    setResult(null);
    setErrorMsg(null);
    setShowPattern(false);
  }

  // Generate a scenario whenever the item changes.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(withBasePath("/api/practice/scenario"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: current.from,
            to: current.to,
            targetText: current.data.term,
            templateText: templateTextFor(current),
            explanation: current.data.explanation ?? "",
            slotLabels: slotLabelsFor(current),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Scenario failed (${res.status})`);
        }
        const data = (await res.json()) as { scenario: string };
        if (cancelled) return;
        setScenario(data.scenario);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Could not load scenario");
        setPhase("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [current]);

  useEffect(() => () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
  }, []);

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
      fd.append("templateText", templateTextFor(current));
      fd.append("explanation", current.data.explanation ?? "");
      fd.append("scenario", scenario);
      fd.append("from", current.from);
      fd.append("to", current.to);
      const res = await fetch(withBasePath("/api/practice/scenario/grade"), { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Grade failed (${res.status})`);
      }
      const data = (await res.json()) as ScenarioResult;
      setResult(data);
      setPhase("result");
      if (data.passed) {
        await recordReviewResult(current.id, "pass");
        setTimeout(() => advance(), 1800);
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
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-black/5 p-6 mt-4 min-h-[12rem]">
          <div className="text-xs font-semibold uppercase tracking-wider text-ink/40 mb-2">
            Scenario
          </div>
          {phase === "fetching" ? (
            <div className="flex items-center gap-2 text-ink/50">
              <Loader2 className="animate-spin" size={16} /> Setting the scene…
            </div>
          ) : (
            <p className="text-lg font-bold text-ink leading-snug whitespace-pre-line">
              {scenario}
            </p>
          )}
        </div>

        <div className="mt-3">
          {!showPattern ? (
            <button
              type="button"
              onClick={() => setShowPattern(true)}
              className="text-xs font-bold text-ink/60 underline underline-offset-4 inline-flex items-center gap-1 active:opacity-70"
            >
              <Eye size={12} /> Peek at the pattern
            </button>
          ) : (
            <div className="rounded-2xl bg-sunshine/30 ring-1 ring-sunshine/60 p-3 text-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink/40 mb-1">
                Use this pattern
              </div>
              <div className="font-bold text-ink break-words">{current.data.term}</div>
            </div>
          )}
        </div>

        {recorder.state === "denied" && (
          <div className="mt-4 rounded-2xl bg-coral/15 ring-1 ring-coral/30 text-coral p-3 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>Microphone permission denied. Enable it to use scenario drills.</span>
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
                {passResult
                  ? "Sounds native"
                  : !result.usedTemplate
                    ? "Pattern not used"
                    : !result.fitsScene
                      ? "Off-topic"
                      : "A bit unnatural"}
              </span>
              <span className="ml-auto text-xs font-mono text-ink/60">
                {Math.round(result.naturalness * 100)}%
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Tag ok={result.usedTemplate} label="template" />
              <Tag ok={result.fitsScene} label="fits scene" />
            </div>
            {result.transcript && (
              <div className="mt-3 text-sm text-ink/80">
                <div className="text-xs uppercase tracking-wider text-ink/40 mb-1">You said</div>
                <div className="break-words">{result.transcript}</div>
              </div>
            )}
            {result.feedback && (
              <div className="mt-3 text-sm text-ink/80">
                <div className="text-xs uppercase tracking-wider text-ink/40 mb-1">Coach</div>
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
            className="w-full rounded-3xl bg-berry text-cream py-5 font-extrabold text-base shadow-md active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Mic size={18} /> Hold to answer
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
            className="w-full rounded-3xl bg-berry text-cream py-5 font-extrabold text-base shadow-md flex items-center justify-center gap-2 animate-pulse"
          >
            <Mic size={18} /> Listening — release to grade
          </button>
        )}
        {phase === "uploading" && (
          <div className="w-full rounded-3xl bg-ink/80 text-cream py-5 font-extrabold text-base flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={18} /> Grading…
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

function Tag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`text-xs font-bold rounded-full px-2 py-0.5 inline-flex items-center gap-1 ${
        ok ? "bg-sky/20 text-sky" : "bg-coral/20 text-coral"
      }`}
    >
      {ok ? <Check size={12} /> : <X size={12} />}
      {label}
    </span>
  );
}
