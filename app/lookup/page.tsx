import { Suspense } from "react";
import LookupView from "./LookupView";

export const dynamic = "force-dynamic";

export default function LookupPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-ink/60">Loading…</div>}>
      <LookupView />
    </Suspense>
  );
}
