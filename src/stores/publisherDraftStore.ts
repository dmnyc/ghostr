import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { PublisherDraft } from '@/types/publisherDraft'
import {
  loadPublisherDraftsNIP37,
  savePublisherDraftNIP37,
  deletePublisherDraftNIP37,
} from '@/lib/nostr/nip37'

const PUBLISHER_DRAFTS_CACHE_KEY = 'ghostr_publisher_drafts'

// Track loading state outside of Zustand to prevent race conditions
let isLoadingInProgress = false

// Debounce relay sync - maps draft ID to timeout
const relaySyncTimeouts = new Map<string, NodeJS.Timeout>()
const RELAY_SYNC_DEBOUNCE_MS = 3000

// Load drafts from localStorage cache
function loadCachedDrafts(): PublisherDraft[] {
  try {
    const cached = localStorage.getItem(PUBLISHER_DRAFTS_CACHE_KEY)
    if (cached) {
      return JSON.parse(cached) as PublisherDraft[]
    }
  } catch {
    // Ignore cache errors
  }
  return []
}

// Save drafts to localStorage cache
function saveDraftsToCache(drafts: PublisherDraft[]): void {
  try {
    localStorage.setItem(PUBLISHER_DRAFTS_CACHE_KEY, JSON.stringify(drafts))
  } catch {
    // Ignore cache errors (e.g., quota exceeded)
  }
}

// Merge relay drafts with cached/local drafts (prefer newer version by updatedAt)
function mergeDrafts(
  local: PublisherDraft[],
  fromRelay: PublisherDraft[],
  deletedIds: Set<string> = new Set()
): PublisherDraft[] {
  const relayMap = new Map(fromRelay.map((d) => [d.id, d]))
  const localMap = new Map(local.map((d) => [d.id, d]))
  const merged = new Map<string, PublisherDraft>()

  // Process all drafts from both sources
  const allIds = new Set([...relayMap.keys(), ...localMap.keys()])

  for (const id of allIds) {
    // Skip drafts that have been explicitly deleted on the relay
    if (deletedIds.has(id)) {
      console.log('[PublisherDraftStore] Skipping deleted draft:', id)
      continue
    }

    const relayDraft = relayMap.get(id)
    const localDraft = localMap.get(id)

    if (relayDraft && localDraft) {
      // Both exist - use newer version by updatedAt
      if (localDraft.updatedAt >= relayDraft.updatedAt) {
        merged.set(id, localDraft)
      } else {
        console.log(
          '[PublisherDraftStore] Using relay version for draft:',
          id,
          'local:',
          localDraft.updatedAt,
          'relay:',
          relayDraft.updatedAt
        )
        merged.set(id, relayDraft)
      }
    } else if (relayDraft) {
      // Only in relay
      merged.set(id, relayDraft)
    } else if (localDraft) {
      // Only local - keep if recent (less than 24 hours old)
      const ageMs = Date.now() - localDraft.updatedAt
      if (ageMs < 24 * 60 * 60 * 1000) {
        merged.set(id, localDraft)
      }
    }
  }

  // Sort by updatedAt descending
  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

interface PublisherDraftStore {
  drafts: PublisherDraft[]
  currentDraftId: string | null
  isLoading: boolean
  isSyncing: boolean
  lastSyncedAt: number | null
  error: string | null

  loadDrafts: () => Promise<void>
  createDraft: (targetKind: 1 | 30023) => PublisherDraft
  updateDraft: (id: string, updates: Partial<PublisherDraft>) => void
  deleteDraft: (id: string) => Promise<void>
  setCurrentDraft: (id: string | null) => void
  archiveDraft: (id: string) => void
}

export const usePublisherDraftStore = create<PublisherDraftStore>((set, get) => ({
  drafts: [],
  currentDraftId: null,
  isLoading: false,
  isSyncing: false,
  lastSyncedAt: null,
  error: null,

  loadDrafts: async () => {
    // Use module-level flag to prevent race conditions (React Strict Mode, etc.)
    if (isLoadingInProgress) {
      console.log('[PublisherDraftStore] loadDrafts already in progress, skipping')
      return
    }
    isLoadingInProgress = true

    const { drafts: existingDrafts } = get()

    // Step 1: Immediately load from cache (instant)
    const cachedDrafts = loadCachedDrafts()
    const hasCachedDrafts = cachedDrafts.length > 0
    const hasExistingDrafts = existingDrafts.length > 0

    if (hasCachedDrafts) {
      console.log('[PublisherDraftStore] Loaded', cachedDrafts.length, 'drafts from cache')
      cachedDrafts.sort((a, b) => b.updatedAt - a.updatedAt)

      // If we already have drafts in state, merge to preserve recent changes
      if (hasExistingDrafts) {
        const mergedWithCache = mergeDrafts(existingDrafts, cachedDrafts)
        set({ drafts: mergedWithCache })
      } else {
        set({ drafts: cachedDrafts })
      }
    }

    // Step 2: Sync from relays in background
    console.log('[PublisherDraftStore] Syncing from relays...')
    set({
      isLoading: !hasCachedDrafts && !hasExistingDrafts,
      isSyncing: true,
      error: null,
    })

    try {
      const { drafts: relayDrafts, deletedIds } = await loadPublisherDraftsNIP37()
      console.log(
        '[PublisherDraftStore] Loaded',
        relayDrafts.length,
        'drafts from relay with',
        deletedIds.size,
        'deletions'
      )

      // Merge with any locally-created drafts that haven't synced yet
      const currentDrafts = get().drafts
      const mergedDrafts = mergeDrafts(currentDrafts, relayDrafts, deletedIds)

      // Update store and cache
      set({
        drafts: mergedDrafts,
        isLoading: false,
        isSyncing: false,
        lastSyncedAt: Date.now(),
      })
      saveDraftsToCache(mergedDrafts)
    } catch (error) {
      console.error('[PublisherDraftStore] Failed to sync from relays:', error)
      set({
        isLoading: false,
        isSyncing: false,
        error: hasCachedDrafts ? null : 'Failed to load drafts',
      })
    } finally {
      isLoadingInProgress = false
    }
  },

  createDraft: (targetKind: 1 | 30023) => {
    const newDraft: PublisherDraft = {
      id: uuidv4(),
      title: '',
      content: '',
      targetKind,
      tags: [],
      status: 'draft',
      updatedAt: Date.now(),
    }

    set((state) => {
      const newDrafts = [newDraft, ...state.drafts]
      saveDraftsToCache(newDrafts)
      return {
        drafts: newDrafts,
        currentDraftId: newDraft.id,
      }
    })

    // Immediately persist to relay
    savePublisherDraftNIP37(newDraft).catch((error) => {
      console.error('[PublisherDraftStore] Failed to save new draft:', error)
    })

    return newDraft
  },

  updateDraft: (id, updates) => {
    set((state) => {
      const newDrafts = state.drafts.map((draft) =>
        draft.id === id ? { ...draft, ...updates, updatedAt: Date.now() } : draft
      )
      saveDraftsToCache(newDrafts)
      return { drafts: newDrafts }
    })

    // Debounced relay sync (3 seconds)
    const existingTimeout = relaySyncTimeouts.get(id)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    const newTimeout = setTimeout(() => {
      const { drafts } = get()
      const draft = drafts.find((d) => d.id === id)
      if (draft) {
        savePublisherDraftNIP37(draft).catch((error) => {
          console.error('[PublisherDraftStore] Failed to sync draft to relay:', error)
        })
      }
      relaySyncTimeouts.delete(id)
    }, RELAY_SYNC_DEBOUNCE_MS)

    relaySyncTimeouts.set(id, newTimeout)
  },

  deleteDraft: async (id) => {
    const { drafts } = get()
    const draft = drafts.find((d) => d.id === id)

    set((state) => {
      const newDrafts = state.drafts.filter((draft) => draft.id !== id)
      saveDraftsToCache(newDrafts)
      return { drafts: newDrafts }
    })

    // Cancel any pending sync for this draft
    const existingTimeout = relaySyncTimeouts.get(id)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
      relaySyncTimeouts.delete(id)
    }

    // Delete from relay
    if (draft) {
      try {
        await deletePublisherDraftNIP37(draft.id, draft.targetKind)
      } catch (error) {
        console.error('[PublisherDraftStore] Failed to delete draft from relay:', error)
      }
    }
  },

  setCurrentDraft: (id) => {
    set({ currentDraftId: id })
  },

  archiveDraft: async (id) => {
    const { drafts } = get()
    const draft = drafts.find((d) => d.id === id)
    if (!draft) return

    // Update local state and cache immediately
    set((state) => {
      const newDrafts = state.drafts.map((d) =>
        d.id === id
          ? { ...d, archived: true, updatedAt: Date.now() }
          : d
      )
      saveDraftsToCache(newDrafts)
      return { drafts: newDrafts }
    })

    // Persist to relay immediately (no debouncing for archive status)
    try {
      const updatedDraft = { ...draft, archived: true, updatedAt: Date.now() }
      await savePublisherDraftNIP37(updatedDraft)
    } catch (error) {
      console.error('[PublisherDraftStore] Failed to save archived status to relay:', error)
    }
  },
}))
