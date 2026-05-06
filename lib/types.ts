import type { LangCode } from "./languages";

export type TermSegment = {
  text: string;
  kind: "template" | "slot";
  // Short type hint for slots only (e.g. "the topic", "a place"). Rendered in headline as [label].
  label?: string;
};

export type LookupExample = {
  target: string;
  native: string;
  source?: string;
  targetSegments?: TermSegment[];
};

export type LookupRelated = {
  word: string;
  kind: "synonym" | "confusable";
  note: string;
};

export type LookupEntry = {
  term: string;
  termSegments?: TermSegment[];
  pronunciation?: string;
  partOfSpeech?: string;
  explanation: string;
  examples: LookupExample[];
  nativeEquivalents?: string[];
  usageNotes: string;
  related: LookupRelated[];
  imagePrompt?: string;
};

export type SavedEntry = {
  id: string;
  query: string;
  from: LangCode;
  to: LangCode;
  data: LookupEntry;
  imageDataUrl?: string;
  createdAt: number;
  updatedAt?: number;
  deleted?: boolean;
  lastReviewedAt?: number;
  reviewCount?: number;
};

export type SeenRecord = {
  id: string;
  query: string;
  from: LangCode;
  to: LangCode;
  term: string;
  termSegments?: TermSegment[];
  firstSeenAt: number;
  lastSeenAt: number;
  count: number;
};
