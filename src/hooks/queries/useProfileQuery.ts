import { useQuery, useQueries, UseQueryResult } from '@tanstack/react-query'
import { fetchProfile, searchProfiles, type SearchProfile } from '@/services/profileSearchService'

/**
 * Query key factory for type-safe profile queries
 * Provides consistent cache key structure
 */
export const profileKeys = {
  all: ['profiles'] as const,
  single: (pubkey: string) => ['profiles', 'single', pubkey] as const,
  batch: (pubkeys: string[]) => ['profiles', 'batch', [...pubkeys].sort()] as const,
  search: (query: string, limit: number) => ['profiles', 'search', query, limit] as const,
}

/**
 * Hook to fetch a single profile by pubkey
 *
 * Features:
 * - Automatic request deduplication
 * - Shared cache across all components
 * - 10-minute stale time (profiles rarely change)
 * - Instant render from cache on subsequent uses
 *
 * @param pubkey - Hex pubkey to fetch profile for
 * @param options - Optional query options
 */
export function useProfileQuery(pubkey: string | null | undefined) {
  return useQuery({
    queryKey: profileKeys.single(pubkey || ''),
    queryFn: async () => {
      if (!pubkey) return null
      return await fetchProfile(pubkey)
    },
    enabled: !!pubkey,
    staleTime: 10 * 60 * 1000, // 10 minutes (profiles rarely change)
    gcTime: 60 * 60 * 1000, // 1 hour
  })
}

/**
 * Hook to fetch multiple profiles in parallel with automatic deduplication
 *
 * Benefits over manual Promise.all:
 * - Deduplicates requests if same profile requested multiple times
 * - Each profile cached individually (other components benefit)
 * - Automatic retry on failure
 * - Suspense-ready
 *
 * @param pubkeys - Array of hex pubkeys to fetch
 */
export function useProfileQueries(pubkeys: string[]) {
  const queries = useQueries({
    queries: pubkeys.map((pubkey) => ({
      queryKey: profileKeys.single(pubkey),
      queryFn: async () => await fetchProfile(pubkey),
      staleTime: 10 * 60 * 1000, // 10 minutes
      gcTime: 60 * 60 * 1000, // 1 hour
    })),
  })

  // Transform results to match expected format
  return {
    profiles: queries.map((q) => q.data).filter((p): p is SearchProfile => p !== null && p !== undefined),
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.some((q) => q.isError),
    errors: queries.filter((q) => q.error).map((q) => q.error),
  }
}

/**
 * Hook to search profiles by name, NIP-05, or npub
 *
 * Features:
 * - 5-minute stale time (search results can change more frequently)
 * - Debounced queries (handled by component if needed)
 * - Filtered results cached separately
 *
 * @param query - Search query string
 * @param limit - Maximum number of results
 */
export function useProfileSearch(query: string, limit: number = 10) {
  return useQuery({
    queryKey: profileKeys.search(query, limit),
    queryFn: async () => {
      if (!query || query.length < 2) return []
      return await searchProfiles(query, limit)
    },
    enabled: query.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Helper type for profile query results
 */
export type ProfileQueryResult = UseQueryResult<SearchProfile | null, Error>
