import "server-only";
import { spawn } from "node:child_process";

// Browser MediaRecorder gives us webm/opus (Chrome/Android) or mp4/aac (iOS Safari).
// `gpt-4o-audio-preview` accepts wav/mp3 only, so normalise to 16 kHz mono wav.
// Pipe in/out via stdin/stdout — no temp files. Requires `ffmpeg` on PATH.
export function transcodeToWav(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", [
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "pipe:1",
    ]);
    const out: Buffer[] = [];
    let stderrBuf = "";
    ff.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    ff.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${stderrBuf.trim()}`));
        return;
      }
      resolve(Buffer.concat(out));
    });
    ff.stdin.on("error", reject);
    ff.stdin.end(input);
  });
}
