"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const next = searchParams.get("next") || "/";

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 bg-cream">
      <form
        action="/api/auth"
        method="POST"
        className="w-full max-w-xs flex flex-col gap-3 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-black/5"
      >
        <h1 className="text-xl font-extrabold text-ink">Dream Dict</h1>
        <p className="text-sm text-ink/60 -mt-1.5">Type the password to enter.</p>
        <input type="hidden" name="next" value={next} />
        <input
          name="password"
          type="password"
          autoFocus
          required
          enterKeyHint="go"
          autoComplete="current-password"
          className="rounded-2xl bg-cream px-4 py-3 ring-1 ring-black/10 text-ink"
          placeholder="Password"
        />
        {error && <div className="text-coral text-sm">Wrong password</div>}
        <button
          type="submit"
          className="rounded-2xl bg-ink text-cream py-3 font-semibold"
        >
          Enter
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
