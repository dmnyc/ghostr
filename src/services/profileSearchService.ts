/**
 * Profile Search Service
 * Handles profile search via nostrarchives.com with local caching.
 *
 * Exports the same surface the rest of the app depends on (SearchProfile,
 * searchProfiles, fetchProfile, parseIdentifier, getDisplayName, formatNpub,
 * getCachedProfile, clearProfileCache) so callers (useProfileQuery.ts etc.)
 * are unchanged. Replaces the former Primal WebSocket backend.
 */

import { nip19 } from 'nostr-tools'
import { naSuggest, naMetadata, type NaProfile } from '@/services/nostrArchivesClient'

export interface SearchProfile {
  pubkey: string
  npub: string
  name?: string
  displayName?: string
  picture?: string
  nip05?: string
  about?: string
}

// LRU Cache for profiles
class ProfileCache {
  private cache = new Map<string, SearchProfile>()
  private maxSize: number

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize
  }

  get(pubkey: string): SearchProfile | undefined {
    const profile = this.cache.get(pubkey)
    if (profile) {
      // Move to end (most recently used)
      this.cache.delete(pubkey)
      this.cache.set(pubkey, profile)
    }
    return profile
  }

  set(pubkey: string, profile: SearchProfile): void {
    // Remove if exists (to update position)
    if (this.cache.has(pubkey)) {
      this.cache.delete(pubkey)
    }
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value
      if (oldest) this.cache.delete(oldest)
    }
    this.cache.set(pubkey, profile)
  }

  has(pubkey: string): boolean {
    return this.cache.has(pubkey)
  }

  clear(): void {
    this.cache.clear()
  }
}

const profileCache = new ProfileCache(100)

/**
 * Convert a nostrarchives profile to our SearchProfile format.
 * Name resolution order: display_name -> preferred_name -> name.
 */
function toSearchProfile(profile: NaProfile): SearchProfile {
  return {
    pubkey: profile.pubkey,
    npub: nip19.npubEncode(profile.pubkey),
    name: profile.name,
    displayName: profile.display_name || profile.preferred_name,
    picture: profile.picture,
    nip05: profile.nip05,
    about: profile.about,
  }
}

/**
 * Parse an npub, nprofile, or hex pubkey identifier
 */
export function parseIdentifier(input: string): { pubkey: string; relays?: string[] } | null {
  const trimmed = input.trim()

  // Check for hex pubkey (64 chars)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return { pubkey: trimmed.toLowerCase() }
  }

  // Try to decode as NIP-19
  try {
    const decoded = nip19.decode(trimmed)

    if (decoded.type === 'npub') {
      return { pubkey: decoded.data }
    }

    if (decoded.type === 'nprofile') {
      return {
        pubkey: decoded.data.pubkey,
        relays: decoded.data.relays,
      }
    }
  } catch {
    // Not a valid NIP-19 identifier
  }

  return null
}

/**
 * Format a pubkey for display (truncated npub)
 */
export function formatNpub(pubkey: string): string {
  try {
    const npub = nip19.npubEncode(pubkey)
    return `${npub.slice(0, 12)}...${npub.slice(-8)}`
  } catch {
    return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`
  }
}

/**
 * Get display name for a profile
 */
export function getDisplayName(profile: SearchProfile): string {
  return profile.displayName || profile.name || formatNpub(profile.pubkey)
}

// ---------------------------------------------------------------------------
// Batched single-profile fetch
//
// useProfileQueries (React Query) calls fetchProfile once per pubkey, which
// would otherwise fire one nostrarchives POST per profile. The batcher below
// coalesces all fetchProfile() calls within a short window into a single
// naMetadata() POST and resolves each caller's promise.
// ---------------------------------------------------------------------------

const BATCH_FLUSH_MS = 20
let batchTimer: ReturnType<typeof setTimeout> | null = null
const batchWaiters = new Map<string, Array<(profile: SearchProfile | null) => void>>()

function scheduleBatchFlush() {
  if (batchTimer) return
  batchTimer = setTimeout(flushBatch, BATCH_FLUSH_MS)
}

async function flushBatch() {
  batchTimer = null
  if (batchWaiters.size === 0) return

  const pending = new Map(batchWaiters)
  batchWaiters.clear()
  const pubkeys = [...pending.keys()]

  let results = new Map<string, SearchProfile>()
  try {
    const fetched = await naMetadata(pubkeys)
    results = new Map(fetched.map((p) => [p.pubkey, toSearchProfile(p)]))
    for (const profile of results.values()) {
      profileCache.set(profile.pubkey, profile)
    }
  } catch (error) {
    console.error('[ProfileSearch] Batch fetch error:', error)
  }

  for (const [pubkey, resolvers] of pending) {
    const profile = results.get(pubkey) ?? null
    for (const resolve of resolvers) resolve(profile)
  }
}

/**
 * Search for profiles by name, NIP-05, or npub/nprofile/hex
 */
export async function searchProfiles(query: string, limit: number = 10): Promise<SearchProfile[]> {
  if (!query || query.length < 2) {
    return []
  }

  // First check if it's a direct identifier (npub, nprofile, hex)
  const parsed = parseIdentifier(query)
  if (parsed) {
    // Check cache first
    const cached = profileCache.get(parsed.pubkey)
    if (cached) {
      return [cached]
    }

    // Fetch single profile (batched under the hood)
    const profile = await fetchProfile(parsed.pubkey)
    if (profile) {
      return [profile]
    }

    // Return basic profile if fetch fails
    return [{
      pubkey: parsed.pubkey,
      npub: nip19.npubEncode(parsed.pubkey),
    }]
  }

  // Search via nostrarchives
  try {
    const results = await naSuggest(query, limit)

    // Filter out mostr.pub bridged profiles and profiles without any name
    const filtered = results.filter((p) => {
      if (p.nip05?.endsWith('@mostr.pub')) return false
      return p.name || p.display_name || p.preferred_name
    })

    const searchProfiles = filtered.map(toSearchProfile)
    searchProfiles.forEach((p) => profileCache.set(p.pubkey, p))

    return searchProfiles
  } catch (error) {
    console.error('[ProfileSearch] Search error:', error)
    return []
  }
}

/**
 * Fetch a single profile by pubkey. Concurrent calls are batched into one
 * nostrarchives metadata request (see flushBatch).
 */
export async function fetchProfile(pubkey: string): Promise<SearchProfile | null> {
  const normalized = pubkey.toLowerCase()

  // Check cache first
  const cached = profileCache.get(normalized)
  if (cached) {
    return cached
  }

  return new Promise<SearchProfile | null>((resolve) => {
    const existing = batchWaiters.get(normalized)
    if (existing) {
      existing.push(resolve)
    } else {
      batchWaiters.set(normalized, [resolve])
    }
    scheduleBatchFlush()
  })
}

/**
 * Get a profile from cache only (no fetch)
 */
export function getCachedProfile(pubkey: string): SearchProfile | undefined {
  return profileCache.get(pubkey)
}

/**
 * Clear the profile cache
 */
export function clearProfileCache(): void {
  profileCache.clear()
}
