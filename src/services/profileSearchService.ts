/**
 * Profile Search Service
 * Handles profile search via Primal cache with local caching
 */

import { nip19 } from 'nostr-tools'
import { getPrimalCache, type PrimalProfile } from '@/lib/primalCache'

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
 * Convert a PrimalProfile to our SearchProfile format
 */
function toSearchProfile(profile: PrimalProfile): SearchProfile {
  return {
    pubkey: profile.pubkey,
    npub: nip19.npubEncode(profile.pubkey),
    name: profile.name,
    displayName: profile.display_name,
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

/**
 * Search for profiles by name, NIP-05, or npub
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

    // Fetch single profile
    try {
      const primal = getPrimalCache()
      const profile = await primal.fetchProfile(parsed.pubkey)
      if (profile) {
        const searchProfile = toSearchProfile(profile)
        profileCache.set(parsed.pubkey, searchProfile)
        return [searchProfile]
      }
    } catch (error) {
      console.error('[ProfileSearch] Error fetching profile:', error)
    }

    // Return basic profile if fetch fails
    return [{
      pubkey: parsed.pubkey,
      npub: nip19.npubEncode(parsed.pubkey),
    }]
  }

  // Search via Primal cache
  try {
    const primal = getPrimalCache()
    const results = await primal.searchProfiles(query, limit)

    // Filter out mostr.pub bridged profiles and profiles without names
    const filtered = results.filter(p => {
      if (p.nip05?.endsWith('@mostr.pub')) return false
      return p.name || p.display_name
    })

    // Convert and cache results
    const searchProfiles = filtered.map(toSearchProfile)
    searchProfiles.forEach(p => profileCache.set(p.pubkey, p))

    return searchProfiles
  } catch (error) {
    console.error('[ProfileSearch] Search error:', error)
    return []
  }
}

/**
 * Fetch a single profile by pubkey
 */
export async function fetchProfile(pubkey: string): Promise<SearchProfile | null> {
  // Check cache first
  const cached = profileCache.get(pubkey)
  if (cached) {
    return cached
  }

  try {
    const primal = getPrimalCache()
    const profile = await primal.fetchProfile(pubkey)
    if (profile) {
      const searchProfile = toSearchProfile(profile)
      profileCache.set(pubkey, searchProfile)
      return searchProfile
    }
  } catch (error) {
    console.error('[ProfileSearch] Error fetching profile:', error)
  }

  return null
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
