type Bucket = { resetAt: number; count: number };

const mem = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cur = mem.get(key);

  if (!cur || now > cur.resetAt) {
    mem.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (cur.count >= limit) {
    return { ok: false, remaining: 0, resetAt: cur.resetAt };
  }

  cur.count += 1;
  mem.set(key, cur);
  return { ok: true, remaining: limit - cur.count, resetAt: cur.resetAt };
}