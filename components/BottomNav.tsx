"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, BookHeart, Sparkles, Mic } from "lucide-react";
import { clsx } from "clsx";

const TABS = [
  { href: "/", label: "For You", icon: Sparkles },
  { href: "/search", label: "Search", icon: Search },
  { href: "/practice", label: "Practice", icon: Mic },
  { href: "/notebook", label: "Notebook", icon: BookHeart },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 bg-paper border-t-[1.5px] border-line pb-safe">
      <div className="mx-auto max-w-md px-2 py-2">
        <div className="flex items-stretch justify-between gap-1">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname === href || pathname?.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex-1 min-w-0 flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-2 text-[11px] font-semibold transition",
                  active
                    ? "bg-vermilion text-white"
                    : "text-muted hover:text-ink",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
