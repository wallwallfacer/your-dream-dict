"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, BookHeart, Languages, Wand2, Flame, ArrowRight } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { listDueReviews } from "@/lib/db/notebook";
import { usePrefs } from "@/lib/prefs";

export default function PracticeIndexPage() {
  const { from, to } = usePrefs();
  const [dueCount, setDueCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDueReviews({ from, to, now: Date.now(), limit: 999 })
      .then((items) => {
        if (!cancelled) setDueCount(items.length);
      })
      .catch(() => {
        if (!cancelled) setDueCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <div className="relative min-h-screen pb-32 bg-cream">
      <header className="mx-auto max-w-md px-5 pt-safe pt-10 pb-3">
        <div className="flex items-center gap-2 text-ink">
          <Mic className="text-coral" size={22} />
          <span className="text-sm font-bold tracking-wide uppercase opacity-80">
            Practice
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight">
          {dueCount === null
            ? "Loading…"
            : dueCount === 0
              ? "Nothing's due — well done."
              : `${dueCount} thing${dueCount === 1 ? "" : "s"} ready to drill.`}
        </h1>
        <p className="mt-2 text-sm text-ink/70 leading-relaxed">
          Pick a depth. Each drill pulls from the same SR queue.
        </p>
      </header>

      <main className="mx-auto max-w-md px-5 mt-4 grid gap-3">
        <DrillCard
          href="/practice/cn-to-en"
          icon={<Languages size={22} />}
          tone="coral"
          title="心译"
          subtitle="See native — say it in your head — flip to check."
          dueCount={dueCount}
          disabled={dueCount === 0}
        />
        <DrillCard
          href="/practice/shadowing"
          icon={<Mic size={22} />}
          tone="sky"
          title="跟读 Shadowing"
          subtitle="Hold to record. AI grades pronunciation + prosody. Strict."
          dueCount={dueCount}
          disabled={dueCount === 0}
        />
        <DrillCard
          href="/practice/scenario"
          icon={<Wand2 size={22} />}
          tone="berry"
          title="情景产出 Scenario"
          subtitle="AI sets a scene. You speak the response. Real-life dress rehearsal."
          dueCount={dueCount}
          disabled={dueCount === 0}
        />
      </main>

      {dueCount === 0 && (
        <div className="mx-auto max-w-md px-5 mt-8 grid gap-3">
          <Link
            href="/notebook"
            className="rounded-3xl bg-white text-ink p-4 shadow-sm ring-1 ring-black/5 active:scale-[0.98] transition flex items-center gap-3"
          >
            <BookHeart className="text-coral" size={20} />
            <div className="flex-1">
              <div className="font-extrabold">Browse your notebook</div>
              <div className="text-xs opacity-70">Reviews come back tomorrow.</div>
            </div>
            <ArrowRight size={18} className="opacity-50" />
          </Link>
          <Link
            href="/"
            className="rounded-3xl bg-white text-ink p-4 shadow-sm ring-1 ring-black/5 active:scale-[0.98] transition flex items-center gap-3"
          >
            <Flame className="text-sunshine" size={20} />
            <div className="flex-1">
              <div className="font-extrabold">Pick up new patterns</div>
              <div className="text-xs opacity-70">Fresh ones in the For-You feed.</div>
            </div>
            <ArrowRight size={18} className="opacity-50" />
          </Link>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function DrillCard({
  href,
  icon,
  tone,
  title,
  subtitle,
  dueCount,
  disabled,
}: {
  href: string;
  icon: React.ReactNode;
  tone: "coral" | "sky" | "berry";
  title: string;
  subtitle: string;
  dueCount: number | null;
  disabled: boolean;
}) {
  const toneClass =
    tone === "coral"
      ? "bg-coral text-cream"
      : tone === "sky"
        ? "bg-sky text-cream"
        : "bg-berry text-cream";
  const inner = (
    <div
      className={`rounded-3xl p-5 shadow-md transition ${
        disabled
          ? "bg-white/70 text-ink/40 ring-1 ring-black/5"
          : `${toneClass} active:scale-[0.98]`
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 ${
            disabled ? "bg-ink/5" : "bg-white/15"
          }`}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold leading-tight text-lg">{title}</div>
          <div className="text-xs opacity-90 mt-0.5 leading-relaxed">{subtitle}</div>
        </div>
        {dueCount !== null && (
          <span
            className={`text-xs font-bold rounded-full px-2.5 py-1 ${
              disabled ? "bg-ink/5 text-ink/40" : "bg-white/20"
            }`}
          >
            {dueCount} due
          </span>
        )}
      </div>
    </div>
  );
  if (disabled) return inner;
  return <Link href={href}>{inner}</Link>;
}
