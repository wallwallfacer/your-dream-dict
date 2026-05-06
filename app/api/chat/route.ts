import { ai } from "@/lib/ai/client";
import { MODELS, SAMPLING, renderPrompt } from "@/lib/ai/config";
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

  const stream = await ai.chat.completions.create({
    model: MODELS.chat,
    messages: [
      { role: "system", content: systemPrompt },
      ...history.slice(-10),
      { role: "user", content: question },
    ],
    temperature: SAMPLING.chat.temperature,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
