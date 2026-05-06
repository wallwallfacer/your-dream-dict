import { ai } from "./client";
import { MODELS, IMAGE } from "./config";

export async function generateImagePng(prompt: string): Promise<Buffer> {
  const styled = `${IMAGE.style_prefix} ${prompt}`;

  const result = await ai.images.generate({
    model: MODELS.image,
    prompt: styled,
    size: IMAGE.size,
    quality: IMAGE.quality,
    n: 1,
  });

  const item = result.data?.[0];
  if (!item) throw new Error("Image gen returned no data");

  if (item.b64_json) {
    return Buffer.from(item.b64_json, "base64");
  }
  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Image gen response had neither b64_json nor url");
}
