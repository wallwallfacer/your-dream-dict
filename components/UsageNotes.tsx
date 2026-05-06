import type { LookupRelated } from "@/lib/types";
import Link from "next/link";
import type { LangCode } from "@/lib/languages";

type Props = {
  notes: string;
  related: LookupRelated[];
  from: LangCode;
  to: LangCode;
};

export function UsageNotes({ notes, related, from, to }: Props) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 space-y-4">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">Vibe</h3>
        <p className="mt-1.5 text-ink/90 leading-relaxed whitespace-pre-line">{notes}</p>
      </div>
      {related.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink/60">Related</h3>
          <ul className="mt-2 space-y-2">
            {related.map((r, i) => (
              <li key={i}>
                <Link
                  href={`/lookup?q=${encodeURIComponent(r.word)}&from=${from}&to=${to}`}
                  className="block rounded-2xl bg-cream px-3 py-2 transition active:scale-[0.99]"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-bold text-ink">{r.word}</span>
                    <span
                      className={`text-[10px] uppercase font-semibold tracking-wider rounded-full px-2 py-0.5 ${
                        r.kind === "synonym" ? "bg-mint" : "bg-coral text-cream"
                      }`}
                    >
                      {r.kind}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink/70 leading-snug">{r.note}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
