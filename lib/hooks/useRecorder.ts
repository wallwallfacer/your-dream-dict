"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState =
  | "idle"
  | "recording"
  | "stopping"
  | "denied"
  | "unsupported";

export type RecordingResult = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
};

// iOS Safari ≥ 14.5 supports audio/mp4; Chrome / Firefox / Android prefer webm/opus.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<Error | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanupStream(), [cleanupStream]);

  const start = useCallback(async () => {
    if (state === "recording" || state === "stopping") return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setError(new Error("This browser does not support audio recording"));
      return;
    }
    const mimeType = pickMimeType();
    if (!mimeType) {
      setState("unsupported");
      setError(new Error("No supported audio codec"));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.addEventListener("dataavailable", (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      });
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setState("recording");
      setError(null);
    } catch (e) {
      setState("denied");
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, [state]);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;
    if (!recorder || state !== "recording") return null;
    setState("stopping");
    return await new Promise<RecordingResult | null>((resolve) => {
      recorder.addEventListener(
        "stop",
        () => {
          const mimeType = recorder.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const durationMs = Date.now() - startedAtRef.current;
          cleanupStream();
          setState("idle");
          resolve({ blob, mimeType, durationMs });
        },
        { once: true },
      );
      try {
        recorder.stop();
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        cleanupStream();
        setState("idle");
        resolve(null);
      }
    });
  }, [state, cleanupStream]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && (state === "recording" || state === "stopping")) {
      try {
        recorder.stop();
      } catch {
        // already stopped — ignore
      }
    }
    cleanupStream();
    setState("idle");
  }, [state, cleanupStream]);

  return { state, error, start, stop, cancel };
}
