"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Search } from "lucide-react";
import { LanguagePicker } from "@/components/LanguagePicker";
import { BottomNav } from "@/components/BottomNav";
import { usePrefs } from "@/lib/prefs";

export default function SearchPage() {
  const router = useRouter();
  const { from, to, setLangs } = usePrefs();
  const [q, setQ] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    const params = new URLSearchParams({ q: query, from, to });
    router.push(`/lookup?${params.toString()}`);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-coral opacity-40 blur-3xl animate-blob"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 -right-24 h-72 w-72 rounded-full bg-sky opacity-30 blur-3xl animate-blob"
        style={{ animationDelay: "-4s" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-mint opacity-40 blur-3xl animate-blob"
        style={{ animationDelay: "-8s" }}
      />

      <main className="relative mx-auto max-w-md px-5 pt-safe pb-32">
        <header className="pt-10 pb-8">
          <div className="flex items-center gap-2 text-ink">
            <Sparkles className="text-coral" size={22} />
            <span className="text-sm font-bold tracking-wide uppercase opacity-80">
              Look up anything
            </span>
          </div>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-ink">
            A word, a phrase, a sentence.
          </h1>
          <p className="mt-2 text-ink/70">
            Type it. We&apos;ll riff on it.
          </p>
        </header>

        <LanguagePicker from={from} to={to} onChange={(f, t) => setLangs(f, t)} />

        <form onSubmit={onSubmit} className="mt-6">
          <div className="rounded-3xl bg-white shadow-xl ring-1 ring-black/5 p-4">
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                to === "en"
                  ? "Try: break the ice"
                  : "试试：大材小用"
              }
              rows={3}
              className="w-full resize-none bg-transparent outline-none text-lg text-ink placeholder:text-ink/40"
              maxLength={500}
              autoFocus
            />
            <button
              type="submit"
              disabled={!q.trim()}
              className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-4 py-3 text-cream font-semibold shadow-md transition active:scale-[0.98] disabled:opacity-40"
            >
              <Search size={18} />
              Look it up
            </button>
          </div>
        </form>
      </main>

      <BottomNav />
    </div>
  );
}
