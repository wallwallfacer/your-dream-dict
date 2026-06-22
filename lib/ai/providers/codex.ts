import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TEXT_PROVIDER } from "../config";
import type { TextCallOpts } from "./claude";

// Hard ceiling for a single codex call. Stays below the route's 30s maxDuration
// so the timeout branch trips first and `callText` reaches its OpenAI fallback
// before Next.js kills the handler.
const CODEX_TIMEOUT_MS = 25_000;

function commonArgs(): string[] {
  const args = [
    "exec",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    "read-only",
  ];
  if (TEXT_PROVIDER.codex.model) {
    args.push("-m", TEXT_PROVIDER.codex.model);
  }
  return args;
}

function buildPrompt(opts: TextCallOpts): string {
  const sys = (opts.system?.trim() ?? "") +
    (opts.jsonMode
      ? "\n\nRespond with ONLY a valid JSON object. No prose, no markdown fences, no commentary."
      : "");
  if (!sys) return opts.user;
  return `# System\n${sys}\n\n# User\n${opts.user}`;
}

export async function callCodexText(opts: TextCallOpts): Promise<string> {
  // Run codex in an ephemeral empty cwd so a prompt-injected `read-only` agent
  // cannot exfiltrate repo files (~/.dream-dict/.env, lib/, etc.). The output
  // file lives inside the same dir so a single rmSync clears everything.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-exec-"));
  const tmpFile = path.join(workDir, "out.txt");
  const args = [...commonArgs(), "-o", tmpFile, buildPrompt(opts)];
  try {
    const { stderr, code } = await runProcess(TEXT_PROVIDER.codex.cli, args, {
      cwd: workDir,
      timeoutMs: CODEX_TIMEOUT_MS,
    });
    if (code !== 0) {
      throw new Error(`codex CLI exited ${code}: ${stderr.slice(0, 400)}`);
    }
    const text = fs.readFileSync(tmpFile, "utf8");
    if (!text.trim()) {
      throw new Error("codex CLI produced empty output");
    }
    return text.trim();
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

// Codex doesn't expose partial-text streaming in its JSON event stream the same
// way claude does. For chat we still want a ReadableStream — emit the final
// message as a single chunk once the process completes. The client sees the
// same content; only the perceived first-token latency differs.
export function callCodexTextStream(opts: TextCallOpts): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const full = await callCodexText(opts);
        controller.enqueue(full);
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number },
): Promise<{ stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "ignore", "pipe"],
      cwd: opts.cwd,
    });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`codex CLI timed out after ${opts.timeoutMs}ms`));
        return;
      }
      resolve({ stderr, code: code ?? 0 });
    });
  });
}
