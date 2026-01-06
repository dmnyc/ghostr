import { create } from 'zustand'

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

  loadHistory: () => void
  addItem: (item: PublishedItem) => void
  updateItem: (oldId: string, newItem: PublishedItem) => void
  removeItem: (id: string) => void
  clearHistory: () => void
  getItemByDTag: (dTag: string) => PublishedItem | undefined
}

const STORAGE_KEY = 'ghostr-publish-history'
const MAX_HISTORY_ITEMS = 100

export const usePublishHistoryStore = create<PublishHistoryStore>((set, get) => ({
  items: [],
  isLoaded: false,

  loadHistory: () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const items = JSON.parse(stored) as PublishedItem[]
        set({ items, isLoaded: true })
      } else {
        set({ isLoaded: true })
      }
    } catch {
      console.error('Failed to load publish history')
      set({ isLoaded: true })
    }
  },

  addItem: (item) => {
    const { items } = get()

    // Don't add duplicates
    if (items.some((i) => i.id === item.id)) {
      return
    }

    // Add to front, keep max items
    const newItems = [item, ...items].slice(0, MAX_HISTORY_ITEMS)
    set({ items: newItems })

    // Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems))
    } catch {
      console.error('Failed to save publish history')
    }
  },

  updateItem: (oldId, newItem) => {
    const { items } = get()
    const index = items.findIndex((i) => i.id === oldId)

    let newItems: PublishedItem[]
    if (index >= 0) {
      // Replace existing item and move to front
      newItems = [newItem, ...items.filter((i) => i.id !== oldId)]
    } else {
      // Item not found, just add as new
      newItems = [newItem, ...items]
    }

    newItems = newItems.slice(0, MAX_HISTORY_ITEMS)
    set({ items: newItems })

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems))
    } catch {
      console.error('Failed to save publish history')
    }
  },

  removeItem: (id) => {
    const { items } = get()
    const newItems = items.filter((i) => i.id !== id)
    set({ items: newItems })

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems))
    } catch {
      console.error('Failed to save publish history')
    }
  },

  clearHistory: () => {
    set({ items: [] })
    localStorage.removeItem(STORAGE_KEY)
  },

  getItemByDTag: (dTag) => {
    const { items } = get()
    return items.find((i) => i.dTag === dTag)
  },
}))
