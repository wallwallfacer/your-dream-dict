"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) {
        setErr("Wrong password");
        setBusy(false);
        return;
      }
      const next = new URLSearchParams(location.search).get("next") || "/";
      location.href = next;
    } catch {
      setErr("Network error, try again");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-6 bg-cream">
      <form
        onSubmit={submit}
        className="w-full max-w-xs flex flex-col gap-3 rounded-3xl bg-white p-6 shadow-xl ring-1 ring-black/5"
      >
        <h1 className="text-xl font-extrabold text-ink">Dream Dict</h1>
        <p className="text-sm text-ink/60 -mt-1.5">Type the password to enter.</p>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          required
          className="rounded-2xl bg-cream px-4 py-3 ring-1 ring-black/10 text-ink"
          placeholder="Password"
        />
        {err && <div className="text-coral text-sm">{err}</div>}
        <button
          type="submit"
          disabled={busy || !pw}
          className="rounded-2xl bg-ink text-cream py-3 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy && <Loader2 className="animate-spin" size={16} />}
          Enter
        </button>
      </form>
    </main>
  );
}
