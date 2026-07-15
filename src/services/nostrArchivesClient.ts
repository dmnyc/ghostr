/**
 * nostrarchives.com profile discovery client.
 *
 * Replaces the Primal WebSocket cache. Two endpoints (no auth, no key):
 *   GET  /v1/search/suggest?q=<query>&limit=<n>   -> { suggestions: [NaProfile] }
 *   POST /v1/profiles/metadata  { pubkeys: [...] } -> { profiles:  [NaProfile] }  (max 500/req)
 *
 * Ported from the sidecar extension (sidepanel.js:3197-3252), including the
 * 429 -> Retry-After cooldown clamped to [30s, 3600s].
 */
const NA_BASE = 'https://api.nostrarchives.com'
const HEX64 = /^[0-9a-f]{64}$/i

export interface NaProfile {
  pubkey: string
  display_name?: string
  preferred_name?: string
  name?: string
  picture?: string
  nip05?: string
  about?: string
}

const SUGGEST_TIMEOUT_MS = 5000
const METADATA_TIMEOUT_MS = 8000
const METADATA_CHUNK = 500

let naCooldownUntil = 0

function naAvailable(): boolean {
  return Date.now() >= naCooldownUntil
}

/** Exposed for tests / debugging. */
export function isNostrArchivesAvailable(): boolean {
  return naAvailable()
}

/** Clamp the cooldown window to [30s, 3600s]; default 60s on parse failure. */
function naBackoff(retryAfterSeconds: number | null | undefined): number {
  const s = typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0 ? retryAfterSeconds : 60
  return Math.min(3600, Math.max(30, s))
}

function applyRateLimit(res: Response) {
  const retryAfter = Number(res.headers.get('Retry-After'))
  naCooldownUntil = Date.now() + naBackoff(Number.isFinite(retryAfter) ? retryAfter : 60) * 1000
}

function normalizeProfile(raw: unknown): NaProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.pubkey !== 'string' || !HEX64.test(p.pubkey)) return null
  return {
    pubkey: p.pubkey.toLowerCase(),
    display_name: typeof p.display_name === 'string' ? p.display_name : undefined,
    preferred_name: typeof p.preferred_name === 'string' ? p.preferred_name : undefined,
    name: typeof p.name === 'string' ? p.name : undefined,
    picture: typeof p.picture === 'string' ? p.picture : undefined,
    nip05: typeof p.nip05 === 'string' ? p.nip05 : undefined,
    about: typeof p.about === 'string' ? p.about : undefined,
  }
}

/** Global username search (autocomplete). */
export async function naSuggest(query: string, limit: number = 8): Promise<NaProfile[]> {
  if (!query || query.length < 2 || !naAvailable()) return []

  const url = `${NA_BASE}/v1/search/suggest?q=${encodeURIComponent(query)}&limit=${limit}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS) })
    if (res.status === 429) {
      applyRateLimit(res)
      return []
    }
    if (!res.ok) return []
    const data = (await res.json()) as { suggestions?: unknown[] }
    const list = Array.isArray(data.suggestions) ? data.suggestions : []
    return list.map(normalizeProfile).filter((p): p is NaProfile => p !== null)
  } catch {
    return []
  }
}

/** Bulk profile metadata lookup. Splits into 500-pubkey chunks. */
export async function naMetadata(pubkeys: string[]): Promise<NaProfile[]> {
  if (pubkeys.length === 0 || !naAvailable()) return []

  const unique = [...new Set(pubkeys.map((p) => p.toLowerCase()).filter((p) => HEX64.test(p)))]
  const out: NaProfile[] = []

  for (let i = 0; i < unique.length; i += METADATA_CHUNK) {
    const chunk = unique.slice(i, i + METADATA_CHUNK)
    try {
      const res = await fetch(`${NA_BASE}/v1/profiles/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkeys: chunk }),
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      })
      if (res.status === 429) {
        applyRateLimit(res)
        break
      }
      if (!res.ok) continue
      const data = (await res.json()) as { profiles?: unknown[] }
      const list = Array.isArray(data.profiles) ? data.profiles : []
      for (const raw of list) {
        const p = normalizeProfile(raw)
        if (p) out.push(p)
      }
    } catch {
      // a failed chunk shouldn't abort the rest
    }
  }

  return out
}
