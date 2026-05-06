# Dream Dict

A bright, mobile-first AI dictionary PWA. Type any word, phrase, or sentence and get:

- A friend-tone explanation in your native language
- Two example sentences with translations
- Casual usage notes (vibe, register, related/confusable words)
- A concept illustration (Gemini 2.5 Flash Image)
- Natural pronunciation for the headword and every example (gpt-4o-mini-tts)
- A follow-up chat about the word (Claude Sonnet 4.6, streaming)

Saved words land in a **Notebook**:
- **Tell me a story** — Claude weaves your saved words into a single short story
- **Learn mode** — flip-animated flashcards (image + word on the front, definition + examples on the back)

## Run locally

```bash
cp .env.local.example .env.local
# fill in OPENAI_API_KEY and OPENAI_BASE_URL (any OpenAI-compatible gateway: OpenAI direct, OpenRouter, LiteLLM, your own proxy, etc.)

npm install
npm run dev
```

Open http://localhost:3000 — best viewed in a mobile viewport (Chrome DevTools → iPhone).

## Models

All three models are routed through one OpenAI-compatible gateway:
- **Chat / explanation / story:** `global.anthropic.claude-sonnet-4-6`
- **Image:** `gemini-2.5-flash-image`
- **TTS:** `gpt-4o-mini-tts`

Change them in `lib/ai/client.ts → MODELS`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Framer Motion · Zustand · IndexedDB (`idb`) · OpenAI SDK · `lucide-react`.

Persistence is **local-only** (IndexedDB + localStorage). No accounts, no cloud sync.

## Languages

`English` and `中文` are wired up in `lib/languages.ts`. Add more entries to that file to expand the picker.
