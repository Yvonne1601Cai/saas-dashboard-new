import { ApiError } from "../api/errors.ts";
import { log } from "../logger.ts";
import { buildUserPrompt, SYSTEM_INSTRUCTION } from "./prompt.ts";
import type { DescriptionInput, DescriptionProvider } from "./provider.ts";

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 400;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Calls the Gemini REST API directly with fetch: one endpoint, no SDK to learn or
 * audit. The API key is sent in a header (never in the URL, which ends up in logs)
 * and only ever exists on the server.
 */
export class GeminiProvider implements DescriptionProvider {
  readonly name = "gemini" as const;

  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generate(input: DescriptionInput): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: buildUserPrompt(input) }] }],
      // Output cap bounds cost and latency even if the prompt is subverted.
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        if (attempt === 0) continue; // network error or timeout: retry once
        throw new ApiError("upstream_error", "The AI service did not respond in time");
      }

      if (response.ok) {
        const data = (await response.json()) as GeminiResponse;
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
        if (!text) throw new ApiError("upstream_error", "The AI service returned no text");
        return text;
      }

      // Log only the status: the response body can echo the prompt.
      log("warn", "gemini request failed", { status: response.status, attempt });
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw new ApiError("upstream_error", "The AI service is unavailable, please try again");
    }
    throw new ApiError("upstream_error", "The AI service is unavailable, please try again");
  }
}
