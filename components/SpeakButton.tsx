"use client";

import { useState } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { playAudio } from "@/lib/audio";
import type { LangCode } from "@/lib/languages";
import { clsx } from "clsx";

type Props = {
  text: string;
  lang: LangCode;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function SpeakButton({ text, lang, size = "md", className }: Props) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await playAudio(text, lang);
    } catch (e) {
      console.warn("[SpeakButton] play failed", e);
    } finally {
      setBusy(false);
    }
  }

  const sizing = {
    sm: "h-8 w-8",
    md: "h-11 w-11",
    lg: "h-12 w-12",
  }[size];
  const iconSize = { sm: 14, md: 18, lg: 22 }[size];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="Play pronunciation"
      className={clsx(
        "inline-flex items-center justify-center rounded-full bg-vermilion text-white transition active:scale-95",
        "hover:brightness-95 disabled:opacity-60",
        sizing,
        className,
      )}
    >
      {busy ? <Loader2 className="animate-spin" size={iconSize} /> : <Volume2 size={iconSize} />}
    </button>
  );
}
