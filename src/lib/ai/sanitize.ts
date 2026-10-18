import { ApiError } from "../api/errors.ts";

export const MAX_AI_DESCRIPTION_LENGTH = 500;

/**
 * Model output is untrusted input. This makes it safe to drop into a form field
 * and later render: control characters, markdown and links are removed and the
 * length is capped. (React also escapes it on render; this is the second layer.)
 */
export function sanitizeDescription(raw: string): string {
  let text = raw
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    // Markdown markers only. Underscores are kept: they appear in real text
    // (snake_case, GEMINI_API_KEY) and are harmless once rendered as plain text.
    .replace(/[*#`>~[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();

  if (text.length > MAX_AI_DESCRIPTION_LENGTH) {
    text = text.slice(0, MAX_AI_DESCRIPTION_LENGTH - 1).trimEnd() + "…";
  }
  if (!text) throw new ApiError("upstream_error", "The AI service returned no usable text");
  return text;
}
