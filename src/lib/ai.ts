// Single place for the LLM provider config. All AI routes go through OpenRouter
// (OpenAI-compatible API), so the model can be swapped via env without code changes.

const AI_BASE_URL = (process.env.AI_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");

export const AI_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

export const AI_CHAT_URL = `${AI_BASE_URL}/chat/completions`;
export const AI_RESPONSES_URL = `${AI_BASE_URL}/responses`;
export const AI_EMBED_URL = `${AI_BASE_URL}/embeddings`;
export const AI_TRANSCRIBE_URL = `${AI_BASE_URL}/audio/transcriptions`;

// Main model for chat, JSON extraction and vision. Must be a non-reasoning model
// (or one with reasoning off by default): several routes use tiny max_tokens and
// read Responses output as output[0].content[0].text.
export const AI_MODEL = process.env.AI_MODEL ?? "openai/gpt-4o-mini";
// Heavier model for long-form generation (landing copy).
export const AI_MODEL_STRONG = process.env.AI_MODEL_STRONG ?? "openai/gpt-4o";
// Keep the same embedding model: stored recipe vectors were built with it.
export const AI_EMBED_MODEL = process.env.AI_EMBED_MODEL ?? "openai/text-embedding-3-small";
export const AI_TRANSCRIBE_MODEL = process.env.AI_TRANSCRIBE_MODEL ?? "openai/gpt-4o-mini-transcribe";
