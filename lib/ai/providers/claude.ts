import { spawn } from "node:child_process";
import { TEXT_PROVIDER } from "../config";

export type TextCallOpts = {
  system?: string;
  user: string;
  jsonMode?: boolean;
};

const EMPTY_MCP_CONFIG = JSON.stringify({ mcpServers: {} });

function commonArgs(opts: TextCallOpts): string[] {
  const system =
    (opts.system?.trim() ?? "") +
    (opts.jsonMode
      ? "\n\nRespond with ONLY a valid JSON object. No prose, no markdown fences, no commentary."
      : "");
  const args = [
    "--print",
    "--model",
    TEXT_PROVIDER.claude.model || "haiku",
    "--strict-mcp-config",
    "--mcp-config",
    EMPTY_MCP_CONFIG,
  ];
  if (system) {
    args.push("--system-prompt", system);
  }
  return args;
}

export async function callClaudeText(opts: TextCallOpts): Promise<string> {
  const args = [...commonArgs(opts), "--output-format", "json", opts.user];
  const { stdout, stderr, code } = await runProcess(TEXT_PROVIDER.claude.cli, args);
  if (code !== 0) {
    throw new Error(`claude CLI exited ${code}: ${stderr.slice(0, 400)}`);
  }
  type Envelope = { result?: string; is_error?: boolean };
  let env: Envelope;
  try {
    env = JSON.parse(stdout) as Envelope;
  } catch {
    throw new Error(`claude CLI returned non-JSON output: ${stdout.slice(0, 200)}`);
  }
  if (env.is_error || typeof env.result !== "string") {
    throw new Error(`claude CLI returned error: ${env.result ?? "(no result)"}`);
  }
  return env.result;
}

export function callClaudeTextStream(opts: TextCallOpts): ReadableStream<string> {
  const args = [
    ...commonArgs(opts),
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    opts.user,
  ];
  const child = spawn(TEXT_PROVIDER.claude.cli, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderrBuf = "";
  child.stderr?.on("data", (b: Buffer) => {
    stderrBuf += b.toString();
  });
  let stdoutBuf = "";

  return new ReadableStream<string>({
    start(controller) {
      child.stdout?.on("data", (b: Buffer) => {
        stdoutBuf += b.toString();
        const lines = stdoutBuf.split("\n");
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) {
          const delta = extractDelta(line);
          if (delta) controller.enqueue(delta);
        }
      });
      child.on("error", (err) => controller.error(err));
      child.on("close", (code) => {
        if (stdoutBuf.trim()) {
          const delta = extractDelta(stdoutBuf);
          if (delta) controller.enqueue(delta);
        }
        if (code !== 0) {
          controller.error(new Error(`claude CLI exited ${code}: ${stderrBuf.slice(0, 400)}`));
        } else {
          controller.close();
        }
      });
    },
    cancel() {
      child.kill();
    },
  });
}

// claude stream-json emits a mix of event types. The text we want lives in
// `stream_event` deltas (input_text_delta variants) and also as full chunks
// inside `assistant` events. To avoid duplicating text we ONLY emit deltas.
function extractDelta(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const ev = JSON.parse(trimmed) as {
      type?: string;
      event?: { type?: string; delta?: { text?: string; type?: string } };
    };
    if (ev.type === "stream_event") {
      const d = ev.event?.delta;
      if (d && (d.type === "text_delta" || d.type === "input_text_delta") && typeof d.text === "string") {
        return d.text;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function runProcess(
  cmd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (b: Buffer) => {
      stdout += b.toString();
    });
    child.stderr?.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}
