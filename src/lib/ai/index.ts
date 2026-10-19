import "server-only";
import { GeminiProvider } from "./gemini.ts";
import { MockProvider } from "./mock.ts";
import type { DescriptionProvider } from "./provider.ts";

export function getDescriptionProvider(): DescriptionProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  return apiKey
    ? new GeminiProvider(apiKey, process.env.GEMINI_MODEL || "gemini-3.8-flash")
    : new MockProvider();
}
