import { ReactNode } from 'react'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

/**
 * Create QueryClient with offline-first configuration
 *
 * Configuration rationale:
 * - staleTime: 5min for profiles (they rarely change)
 * - gcTime: 30min (keep unused data in memory)
 * - refetchOnWindowFocus: false (avoid unnecessary refetches)
 * - refetchOnMount: false (use cached data first)
 * - refetchOnReconnect: true (sync after offline)
 * - retry: 2 attempts (matches existing draftStore retry logic)
 * - networkMode: offlineFirst (work offline, sync when online)
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
})

/**
 * Create localStorage persister for 24-hour cache
 * Only persists successful queries to avoid quota issues
 */
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'ghostr-react-query-cache',
  serialize: (data) => JSON.stringify(data),
  deserialize: (data) => JSON.parse(data),
})

/**
 * Export queryClient for use in stores and hooks
 */
export { queryClient }

interface QueryProviderProps {
  children: ReactNode
}

/**
 * QueryProvider wraps the app with React Query context
 * Provides offline-first caching with localStorage persistence
 */
export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        buster: '', // Increment to invalidate all cached data
      }}
    >
      {children}
      {/* DevTools only in development */}
      <ReactQueryDevtools
        initialIsOpen={false}
        position="bottom"
        buttonPosition="bottom-right"
      />
    </PersistQueryClientProvider>
  )
}
