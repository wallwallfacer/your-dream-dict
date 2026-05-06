"use client";

import { useEffect } from "react";
import { startSync } from "@/lib/sync/client";
import { usePrefs } from "@/lib/prefs";
import { useFeedStore } from "@/lib/feedStore";

export function SyncBoot() {
  useEffect(() => {
    void usePrefs.persist.rehydrate();
    void useFeedStore.persist.rehydrate();
    startSync();
  }, []);
  return null;
}
