// Minimal structured logging: one JSON object per line, which log platforms
// (Cloud Logging, Datadog, ...) parse without configuration. Callers must never
// pass secrets, tokens, or user-entered text (search terms, prompts).
type Level = "info" | "warn" | "error";

export function log(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (process.env.VITEST) return; // keep test output readable
  const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
