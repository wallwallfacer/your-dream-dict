import { LANGUAGES, type LangCode } from "./languages";

// Canonical id for a dictionary entry / feed card. Shared between the client
// notebook (IndexedDB) and the server feed store so a "new" feed card and the
// saved entry the user later creates resolve to the SAME id (dedup + save).
export function entryId(query: string, from: string, to: string): string {
  return `${from}->${to}::${query.trim().toLowerCase()}`;
}

// One shared feed + cursor per language pair (the app has no per-user scoping).
export function langKey(from: string, to: string): string {
  return `${from}-${to}`;
}

// Inverse of langKey(): split "<from>-<to>" back into validated codes, or null
// if either side isn't a known language. Used by feed routes that only receive
// the langKey but need from/to (e.g. to drive generation).
export function parseLangKey(key: string): { from: LangCode; to: LangCode } | null {
  const [from, to] = key.split("-");
  const ok = (c: string): c is LangCode => LANGUAGES.some((l) => l.code === c);
  if (!ok(from) || !ok(to)) return null;
  return { from, to };
}
