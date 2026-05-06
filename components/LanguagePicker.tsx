"use client";

import { ArrowLeftRight } from "lucide-react";
import { LANGUAGES, type LangCode } from "@/lib/languages";

type Props = {
  from: LangCode;
  to: LangCode;
  onChange: (from: LangCode, to: LangCode) => void;
};

export function LanguagePicker({ from, to, onChange }: Props) {
  function pick(role: "from" | "to", code: LangCode) {
    if (role === "from") {
      onChange(code, code === to ? from : to);
    } else {
      onChange(code === from ? to : from, code);
    }
  }

  function swap() {
    onChange(to, from);
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 w-full">
      <Selector label="I speak" value={from} onPick={(c) => pick("from", c)} accent="bg-mint" />
      <button
        type="button"
        onClick={swap}
        aria-label="Swap languages"
        className="h-11 w-11 rounded-full bg-ink text-cream shadow-md flex items-center justify-center transition active:scale-95"
      >
        <ArrowLeftRight size={18} />
      </button>
      <Selector label="Learning" value={to} onPick={(c) => pick("to", c)} accent="bg-coral" />
    </div>
  );
}

function Selector({
  label,
  value,
  onPick,
  accent,
}: {
  label: string;
  value: LangCode;
  onPick: (c: LangCode) => void;
  accent: string;
}) {
  return (
    <div className={`rounded-3xl ${accent} text-ink p-3 shadow-md`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onPick(l.code)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              value === l.code ? "bg-ink text-cream" : "bg-cream/60 hover:bg-cream"
            }`}
          >
            {l.flag} {l.nativeLabel}
          </button>
        ))}
      </div>
    </div>
  );
}
