import { GoogleGenAI } from "@google/genai";

/**
 * ---------------------------------------------------------
 * Gemini API key
 * ---------------------------------------------------------
 */

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not configured.");
}

/**
 * ---------------------------------------------------------
 * Gemini client
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 * Do NOT configure a custom Undici global dispatcher here.
 *
 * @google/genai's Files API manages its own upload request.
 * A custom Undici dispatcher can cause:
 *
 *   UND_ERR_INVALID_ARG
 *   invalid content-length header
 *
 * when uploading Blob objects.
 */

export const gemini = new GoogleGenAI({
  apiKey,

  httpOptions: {
    timeout: 600_000,
  },
});

/**
 * ---------------------------------------------------------
 * Models
 * ---------------------------------------------------------
 *
 * gemini-3.6-flash is currently used as the primary model
 * because gemini-3.7-flash exhausted the project's
 * free-tier quota earlier.
 */

export const GEMINI_MODEL = "gemini-3.6-flash";

export const GEMINI_FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
] as const;

export const GEMINI_MODELS = [
  GEMINI_MODEL,
  ...GEMINI_FALLBACK_MODELS,
] as const;

/**
 * ---------------------------------------------------------
 * Retry detection
 * ---------------------------------------------------------
 */

export function isRetryableGeminiError(
  error: unknown
): boolean {
  if (!error) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const normalized = message.toLowerCase();

  return (
    normalized.includes("503") ||
    normalized.includes("429") ||
    normalized.includes("unavailable") ||
    normalized.includes("service unavailable") ||
    normalized.includes("high demand") ||
    normalized.includes("temporarily") ||
    normalized.includes("overloaded") ||
    normalized.includes("capacity") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("und_err_headers_timeout") ||
    normalized.includes("und_err_body_timeout") ||
    normalized.includes("econnreset") ||
    normalized.includes("socket")
  );
}

/**
 * ---------------------------------------------------------
 * Exponential backoff
 * ---------------------------------------------------------
 */

export async function waitForRetry(
  attempt: number
): Promise<void> {
  const baseDelay =
    1500 * Math.pow(2, attempt);

  const jitter =
    Math.floor(Math.random() * 500);

  const delay =
    baseDelay + jitter;

  console.log(
    `[Gemini] Waiting ${delay}ms before retry...`
  );

  await new Promise<void>((resolve) =>
    setTimeout(resolve, delay)
  );
}