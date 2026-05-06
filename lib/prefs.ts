"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LangCode } from "./languages";

type PrefsState = {
  from: LangCode;
  to: LangCode;
  setLangs: (from: LangCode, to: LangCode) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      from: "zh",
      to: "en",
      setLangs: (from, to) => set({ from, to }),
    }),
    { name: "dream-dict-prefs", skipHydration: true },
  ),
);
