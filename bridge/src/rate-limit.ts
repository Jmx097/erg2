export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number, nowMs: number = Date.now()): {
    allowed: boolean;
    retryAfterMs: number;
  } {
    const timestamps = this.buckets.get(key) ?? [];
    const cutoff = nowMs - windowMs;
    const active = timestamps.filter((timestamp) => timestamp > cutoff);

    if (active.length >= limit) {
      const retryAfterMs = Math.max(0, windowMs - (nowMs - active[0]!));
      this.buckets.set(key, active);
      return { allowed: false, retryAfterMs };
    }

    active.push(nowMs);
    this.buckets.set(key, active);
    return { allowed: true, retryAfterMs: 0 };
  }
}
