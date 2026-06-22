import { ai } from "../client";
import { MODELS, SAMPLING, type TextRoute } from "../config";
import type { TextCallOpts } from "./claude";

const SAMPLING_BY_ROUTE: Record<TextRoute, keyof typeof SAMPLING> = {
  lookup: "lookup",
  chat: "chat",
  story: "story",
  recommendations: "recommendations",
  scenario_generate: "scenario_generate",
};

const MODEL_BY_ROUTE: Record<TextRoute, keyof typeof MODELS> = {
  lookup: "chat",
  chat: "chat",
  story: "chat",
  recommendations: "chat",
  scenario_generate: "scenario_generate",
};

function messages(opts: TextCallOpts) {
  const msgs: { role: "system" | "user"; content: string }[] = [];
  if (opts.system?.trim()) {
    msgs.push({ role: "system", content: opts.system });
  }
  msgs.push({ role: "user", content: opts.user });
  return msgs;
}

export async function callOpenAIText(route: TextRoute, opts: TextCallOpts): Promise<string> {
  const sampling = SAMPLING[SAMPLING_BY_ROUTE[route]];
  const completion = await ai.chat.completions.create({
    model: MODELS[MODEL_BY_ROUTE[route]],
    messages: messages(opts),
    temperature: sampling.temperature,
    ...(sampling.max_completion_tokens
      ? { max_completion_tokens: sampling.max_completion_tokens }
      : {}),
    ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

export function callOpenAITextStream(route: TextRoute, opts: TextCallOpts): ReadableStream<string> {
  const sampling = SAMPLING[SAMPLING_BY_ROUTE[route]];
  return new ReadableStream<string>({
    async start(controller) {
      try {
        const stream = await ai.chat.completions.create({
          model: MODELS[MODEL_BY_ROUTE[route]],
          messages: messages(opts),
          temperature: sampling.temperature,
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) controller.enqueue(delta);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
