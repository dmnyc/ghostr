import { create } from 'zustand'
import { loadPublishHistoryFromRelay, savePublishHistoryToRelay } from '@/lib/nostr/nip78'
import { MAX_PUBLISH_HISTORY_ITEMS } from '@/lib/constants'

export interface PublishedItem {
  id: string // The published event ID
  content: string
  kind: 1 | 30023
  title?: string // For long-form articles
  dTag?: string // For long-form articles (used for republishing)
  coverImage?: string // Cover image URL
  publishedAt: number
  source: 'direct' | 'delegate'
  delegatePubkey?: string // Only for delegate submissions
  delegateNpub?: string
}

interface PublishHistoryStore {
  items: PublishedItem[]
  isLoaded: boolean
  isSaving: boolean
  lastViewedAt: number | null

  loadHistory: () => Promise<void>
  saveHistory: () => Promise<void>
  addItem: (item: PublishedItem) => void
  updateItem: (oldId: string, newItem: PublishedItem) => void
  removeItem: (id: string) => void
  clearHistory: () => void
  getItemByDTag: (dTag: string) => PublishedItem | undefined
  markAsViewed: () => void
  getUnreadCount: () => number
}

const STORAGE_KEY = 'ghostr-publish-history'
const LAST_VIEWED_KEY = 'ghostr-history-last-viewed'

// Helper to load last viewed timestamp
function loadLastViewed(): number | null {
  try {
    const stored = localStorage.getItem(LAST_VIEWED_KEY)
    if (stored) {
      return parseInt(stored, 10)
    }
  } catch {
    // Ignore errors
  }
  return null
}

// Helper to save to localStorage (cache)
function saveToCache(items: PublishedItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    console.error('Failed to save publish history to cache')
  }
}

// Helper to load from localStorage (cache)
function loadFromCache(): PublishedItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as PublishedItem[]
    }
  } catch {
    console.error('Failed to load publish history from cache')
  }
  return []
}

export const usePublishHistoryStore = create<PublishHistoryStore>((set, get) => ({
  items: [],
  isLoaded: false,
  isSaving: false,
  lastViewedAt: loadLastViewed(),

  loadHistory: async () => {
    // First load from cache for immediate display
    const cached = loadFromCache()
    if (cached.length > 0) {
      set({ items: cached })
    }

    // Then load from relay (source of truth)
    try {
      const items = await loadPublishHistoryFromRelay()
      set({ items, isLoaded: true })
      // Update cache with relay data
      saveToCache(items)
    } catch (error) {
      console.error('Failed to load publish history from relay:', error)
      // Fall back to cached data
      set({ items: cached, isLoaded: true })
    }
  },

  saveHistory: async () => {
    const { items, isSaving } = get()
    if (isSaving) return

    set({ isSaving: true })

    try {
      await savePublishHistoryToRelay(items)
    } catch (error) {
      console.error('Failed to save publish history to relay:', error)
    } finally {
      set({ isSaving: false })
    }
  },

  addItem: (item) => {
    const { items, saveHistory } = get()

    // Don't add duplicates
    if (items.some((i) => i.id === item.id)) {
      return
    }

    // Add to front, keep max items
    const newItems = [item, ...items].slice(0, MAX_PUBLISH_HISTORY_ITEMS)
    set({ items: newItems })

    // Save to cache immediately
    saveToCache(newItems)

    // Save to relay (async, don't block)
    saveHistory()
  },

  updateItem: (oldId, newItem) => {
    const { items, saveHistory } = get()
    const index = items.findIndex((i) => i.id === oldId)

    let newItems: PublishedItem[]
    if (index >= 0) {
      // Replace existing item and move to front
      newItems = [newItem, ...items.filter((i) => i.id !== oldId)]
    } else {
      // Item not found, just add as new
      newItems = [newItem, ...items]
    }

    newItems = newItems.slice(0, MAX_PUBLISH_HISTORY_ITEMS)
    set({ items: newItems })

    // Save to cache immediately
    saveToCache(newItems)

    // Save to relay (async)
    saveHistory()
  },

  removeItem: (id) => {
    const { items, saveHistory } = get()
    const newItems = items.filter((i) => i.id !== id)
    set({ items: newItems })

    // Save to cache immediately
    saveToCache(newItems)

    // Save to relay (async)
    saveHistory()
  },

  clearHistory: () => {
    const { saveHistory } = get()
    set({ items: [] })
    localStorage.removeItem(STORAGE_KEY)
    saveHistory()
  },

  getItemByDTag: (dTag) => {
    const { items } = get()
    return items.find((i) => i.dTag === dTag)
  },

  markAsViewed: () => {
    const timestamp = Date.now()
    set({ lastViewedAt: timestamp })
    try {
      localStorage.setItem(LAST_VIEWED_KEY, timestamp.toString())
    } catch {
      // Ignore storage errors
    }
  },

  getUnreadCount: () => {
    const { items, lastViewedAt } = get()
    if (!lastViewedAt) {
      // Never viewed - show count only if there are items
      return items.length > 0 ? items.length : 0
    }
    return items.filter((i) => i.publishedAt > lastViewedAt).length
  },
}))
