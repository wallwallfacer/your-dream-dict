import { ai } from "./client";
import { MODELS, TTS, ttsVoiceFor } from "./config";
import type { LangCode } from "../languages";

export async function synthesizeSpeech(text: string, langCode: LangCode): Promise<Buffer> {
  const speech = await ai.audio.speech.create({
    model: MODELS.tts,
    voice: ttsVoiceFor(langCode),
    input: text,
    instructions: TTS.style_instructions,
    response_format: TTS.format,
    speed: TTS.speed,
  });
  const buf = await speech.arrayBuffer();
  return Buffer.from(buf);
}
