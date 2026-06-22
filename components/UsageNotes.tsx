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
    <section className="border-[1.5px] border-line rounded-2xl bg-paper p-5 space-y-5">
      <div>
        <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-vermilion">
          Vibe · 语感
        </h3>
        <p
          className="mt-2 text-body leading-[1.65] whitespace-pre-line text-[15px]"
          style={{ fontFamily: "var(--font-cn)" }}
        >
          {notes}
        </p>
      </div>
      {related.length > 0 && (
        <div>
          <h3 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-vermilion">
            Related · 关联
          </h3>
          <ul className="mt-2.5 space-y-2">
            {related.map((r, i) => (
              <li key={i}>
                <Link
                  href={`/lookup?q=${encodeURIComponent(r.word)}&from=${from}&to=${to}`}
                  className="block border-[1.5px] border-line-soft rounded-xl px-3.5 py-2.5 transition active:scale-[0.99] hover:border-line"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-[18px] text-ink leading-tight">{r.word}</span>
                    <span
                      className={`text-[9px] font-extrabold uppercase tracking-[0.12em] rounded-md px-1.5 py-0.5 ${
                        r.kind === "synonym"
                          ? "border-[1.5px] border-tag-line text-muted"
                          : "bg-vermilion text-white"
                      }`}
                    >
                      {r.kind}
                    </span>
                  </div>
                  <p
                    className="mt-1 text-[13px] text-body leading-snug"
                    style={{ fontFamily: "var(--font-cn)" }}
                  >
                    {r.note}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
