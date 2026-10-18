// Sliding-window rate limiter, in memory.
//
// Good enough to stop a single account from hammering a paid API from one server
// instance. It is NOT shared between serverless instances or restarts; the README
// lists a shared store (Redis / Firestore) plus a daily spend cap as the production
// version.
export interface RateLimiter {
  take(key: string, now?: number): { allowed: boolean; retryAfterSeconds: number };
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    take(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((recent[0] + windowMs - now) / 1000) };
      }
      recent.push(now);
      hits.set(key, recent);

      // Occasional sweep so keys of users who never come back do not accumulate.
      if (hits.size > 1000) {
        for (const [k, times] of hits) {
          if (times.every((t) => now - t >= windowMs)) hits.delete(k);
        }
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
