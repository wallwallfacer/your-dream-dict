import { providerForRoute, type TextRoute } from "./config";
import { callClaudeText, callClaudeTextStream, type TextCallOpts } from "./providers/claude";
import { callCodexText, callCodexTextStream } from "./providers/codex";
import { callOpenAIText, callOpenAITextStream } from "./providers/openai-fallback";

export type CallOpts = TextCallOpts & { route: TextRoute };

function fallbackDisabled(): boolean {
  return process.env.DREAM_DICT_TEXT_NO_FALLBACK === "1";
}

function logFallback(route: TextRoute, provider: string, reason: string) {
  console.warn(
    `[ai/text] fallback to openai api`,
    JSON.stringify({ route, provider, reason }),
  );
}

export async function callText({ route, ...opts }: CallOpts): Promise<string> {
  const provider = providerForRoute(route);
  if (provider === "openai") {
    return callOpenAIText(route, opts);
  }
  try {
    const text =
      provider === "claude" ? await callClaudeText(opts) : await callCodexText(opts);
    if (opts.jsonMode) {
      // Sanity-parse JSON; on failure retry once, then fall back.
      try {
        validateLooseJSON(text);
      } catch {
        try {
          const retry =
            provider === "claude" ? await callClaudeText(opts) : await callCodexText(opts);
          validateLooseJSON(retry);
          return retry;
        } catch (retryErr) {
          if (fallbackDisabled()) throw retryErr;
          logFallback(route, provider, `json parse failed twice`);
          return callOpenAIText(route, opts);
        }
      }
    }
    return text;
  } catch (err) {
    if (fallbackDisabled()) throw err;
    logFallback(route, provider, err instanceof Error ? err.message : String(err));
    return callOpenAIText(route, opts);
  }
}

export function callTextStream({ route, ...opts }: CallOpts): ReadableStream<string> {
  const provider = providerForRoute(route);
  if (provider === "openai") {
    return callOpenAITextStream(route, opts);
  }
  const primary =
    provider === "claude" ? callClaudeTextStream(opts) : callCodexTextStream(opts);

  if (fallbackDisabled()) return primary;
  return wrapWithFallback(primary, () => callOpenAITextStream(route, opts), {
    route,
    provider,
  });
}

// If the primary stream errors BEFORE emitting any text, transparently swap to
// the fallback stream. Once any text has been emitted we can't replay; emit
// nothing further and close so the client keeps what it has.
function wrapWithFallback(
  primary: ReadableStream<string>,
  buildFallback: () => ReadableStream<string>,
  meta: { route: TextRoute; provider: string },
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      let emitted = false;
      const reader = primary.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            emitted = true;
            controller.enqueue(value);
          }
        }
        controller.close();
      } catch (err) {
        if (emitted) {
          console.warn(
            `[ai/text] stream died mid-flight`,
            JSON.stringify({ ...meta, reason: err instanceof Error ? err.message : String(err) }),
          );
          controller.close();
          return;
        }
        logFallback(meta.route, meta.provider, err instanceof Error ? err.message : String(err));
        try {
          const fbReader = buildFallback().getReader();
          while (true) {
            const { value, done } = await fbReader.read();
            if (done) break;
            if (value) controller.enqueue(value);
          }
          controller.close();
        } catch (fbErr) {
          controller.error(fbErr);
        }
      }
    },
  });
}

// Tolerant JSON validation matching the existing parseJsonLoose convention:
// strip markdown fences, slice to the outermost braces, then JSON.parse.
function validateLooseJSON(text: string): void {
  JSON.parse(extractJSON(text));
}

// Extract the JSON-object substring from a CLI response that may have markdown
// fences or stray prose. Exported so call sites can JSON.parse the result of
// `callText({ jsonMode: true })` without redoing the cleanup themselves.
export function extractJSON(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    throw new Error("no JSON object found");
  }
  return cleaned.slice(first, last + 1);
}
