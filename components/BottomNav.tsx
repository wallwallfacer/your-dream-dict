"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, BookHeart, Flame, Mic } from "lucide-react";
import { clsx } from "clsx";

const TABS = [
  { href: "/", label: "For You", icon: Flame },
  { href: "/search", label: "Search", icon: Search },
  { href: "/practice", label: "Practice", icon: Mic },
  { href: "/notebook", label: "Notebook", icon: BookHeart },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 pb-safe">
      <div className="mx-auto max-w-md px-3">
        <div className="flex items-center justify-between rounded-3xl bg-ink text-cream shadow-2xl px-2 py-1.5">
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
                  "flex-1 flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2 text-xs transition",
                  active ? "bg-sunshine text-ink" : "opacity-70 hover:opacity-100",
                )}
              >
                <Icon size={20} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
