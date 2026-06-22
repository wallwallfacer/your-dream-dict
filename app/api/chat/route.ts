import { renderPrompt } from "@/lib/ai/config";
import { callTextStream } from "@/lib/ai/text";
import { lang, type LangCode } from "@/lib/languages";
import type { LookupEntry } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatBody = {
  entry: LookupEntry;
  query: string;
  from: LangCode;
  to: LangCode;
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
};

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { entry, query, from, to, history, question } = body;
  if (!entry || !question) {
    return new Response(JSON.stringify({ error: "Missing entry or question" }), { status: 400 });
  }

  const native = lang(from);
  const target = lang(to);

  const systemPrompt = renderPrompt("chat_system", {
    nativeLabel: native.label,
    targetLabel: target.label,
    query,
    entryJson: JSON.stringify(entry),
  });

  const userPrompt = composeUserPrompt(history.slice(-10), question);

  const stream = callTextStream({
    route: "chat",
    system: systemPrompt,
    user: userPrompt,
  });

  const encoder = new TextEncoder();
  const encoded = new ReadableStream({
    async start(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(encoder.encode(value));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(encoded, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// CLI providers don't have a multi-turn message protocol, so we serialise
// recent history into the user prompt as a labelled transcript. The current
// question is the trailing entry the model should answer.
function composeUserPrompt(
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
): string {
  if (history.length === 0) return question;
  const lines = history.map((m) => {
    const tag = m.role === "user" ? "USER" : "ASSISTANT";
    return `${tag}: ${m.content}`;
  });
  lines.push(`USER: ${question}`);
  lines.push("ASSISTANT:");
  return `Conversation so far:\n\n${lines.join("\n\n")}`;
}
