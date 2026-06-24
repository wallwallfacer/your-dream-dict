"use client";

import { useEffect } from "react";
import { startSync } from "@/lib/sync/client";
import { usePrefs } from "@/lib/prefs";

export function SyncBoot() {
  useEffect(() => {
    void usePrefs.persist.rehydrate();
    // The feed store is in-memory now (server is the source of truth), so it
    // no longer needs rehydration.
    startSync();
  }, []);
  return null;
}
