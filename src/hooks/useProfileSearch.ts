import { useState, useRef, useCallback } from 'react'
import { searchProfiles, type SearchProfile } from '@/services/profileSearchService'

interface UseProfileSearchReturn {
  results: SearchProfile[]
  isLoading: boolean
  error: string | null
  search: (query: string) => void
  clear: () => void
}

/**
 * Hook for debounced profile search
 */
export function useProfileSearch(debounceMs: number = 300): UseProfileSearchReturn {
  const [results, setResults] = useState<SearchProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const search = useCallback(
    (query: string) => {
      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Abort previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Clear results if query is too short
      if (!query || query.length < 2) {
        setResults([])
        setIsLoading(false)
        setError(null)
        return
      }

      setIsLoading(true)
      setError(null)

      // Debounce the search
      timeoutRef.current = setTimeout(async () => {
        const controller = new AbortController()
        abortControllerRef.current = controller

        try {
          const searchResults = await searchProfiles(query, 10)

          // Check if request was aborted
          if (controller.signal.aborted) {
            return
          }

          setResults(searchResults)
          setError(null)
        } catch (err) {
          // Ignore abort errors
          if (err instanceof Error && err.name === 'AbortError') {
            return
          }

          console.error('[useProfileSearch] Search error:', err)
          setError(err instanceof Error ? err.message : 'Search failed')
          setResults([])
        } finally {
          if (!controller.signal.aborted) {
            setIsLoading(false)
          }
        }
      }, debounceMs)
    },
    [debounceMs]
  )

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setResults([])
    setIsLoading(false)
    setError(null)
  }, [])

  return {
    results,
    isLoading,
    error,
    search,
    clear,
  }
}
