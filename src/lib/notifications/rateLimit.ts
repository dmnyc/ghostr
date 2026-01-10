interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const MAX_NOTIFICATIONS_PER_WINDOW = 5

export function checkRateLimit(recipientPubkey: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(recipientPubkey)

  if (!entry) {
    rateLimitMap.set(recipientPubkey, { count: 1, windowStart: now })
    return true
  }

  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 1
    entry.windowStart = now
    return true
  }

  if (entry.count >= MAX_NOTIFICATIONS_PER_WINDOW) {
    console.warn('[RateLimit] Limit exceeded for', recipientPubkey.slice(0, 8))
    return false
  }

  entry.count++
  return true
}

export function cleanupRateLimitMap(): void {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key)
    }
  }
}

// Cleanup stale entries every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(cleanupRateLimitMap, 5 * 60 * 1000)
}
