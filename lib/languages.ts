export type LangCode = "en" | "zh";

export type Language = {
  code: LangCode;
  label: string;
  nativeLabel: string;
  flag: string;
  ttsHint: string;
};

export const LANGUAGES: Language[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    flag: "🇬🇧",
    ttsHint: "American English speaker, warm and clear",
  },
  {
    code: "zh",
    label: "Chinese",
    nativeLabel: "中文",
    flag: "🇨🇳",
    ttsHint: "Mainland Mandarin speaker, warm and clear",
  },
];

export function lang(code: LangCode): Language {
  const found = LANGUAGES.find((l) => l.code === code);
  if (!found) throw new Error(`Unknown language: ${code}`);
  return found;
}
