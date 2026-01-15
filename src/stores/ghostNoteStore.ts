import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  GhostNote,
  GhostNoteStatus,
  GhostNoteDirection,
} from '@/types/ghostNote'
import { DEFAULT_EXPIRATION_SECONDS } from '@/types/ghostNote'
import { useAuthStore } from '@/stores/authStore'

// Helper to get current user's pubkey
function getCurrentUserPubkey(): string | null {
  return useAuthStore.getState().user?.pubkey ?? null
}

interface GhostNoteSettings {
  defaultExpiration: number // seconds
  notifyOnRead: boolean
  showBadge: boolean
  sendReadReceiptsByDefault: boolean
  keepDecryptedContent: boolean
  autoCleanupExpired: boolean
}

interface GhostNoteStore {
  // Ghost Notes data
  ghostNotes: GhostNote[]

  // Settings
  settings: GhostNoteSettings

  // UI state
  unreadCount: number
  lastCheckTimestamp: number

  // CRUD Actions
  addGhostNote: (note: GhostNote) => void
  updateGhostNote: (id: string, updates: Partial<GhostNote>) => void
  removeGhostNote: (id: string) => void

  // Queries
  getGhostNoteById: (id: string) => GhostNote | undefined
  getGhostNoteByEventId: (eventId: string) => GhostNote | undefined
  getGhostNoteByDTag: (dTag: string) => GhostNote | undefined
  getGhostNotes: (
    direction: GhostNoteDirection,
    status?: GhostNoteStatus
  ) => GhostNote[]
  getSentGhostNotes: () => GhostNote[]
  getReceivedGhostNotes: () => GhostNote[]
  getActiveGhostNotes: (direction: GhostNoteDirection) => GhostNote[]

  // Status updates
  markAsRead: (id: string) => void
  markAsRevoked: (id: string) => void
  markAsExpired: (id: string) => void
  setDecryptedContent: (id: string, content: string) => void

  // Settings actions
  updateSettings: (updates: Partial<GhostNoteSettings>) => void

  // Sync state
  setLastCheckTimestamp: (timestamp: number) => void
  updateUnreadCount: () => void

  // Cleanup
  cleanupExpiredNotes: () => number // Returns count of cleaned notes
  clearDecryptedContent: () => void
}

const DEFAULT_SETTINGS: GhostNoteSettings = {
  defaultExpiration: DEFAULT_EXPIRATION_SECONDS,
  notifyOnRead: true,
  showBadge: true,
  sendReadReceiptsByDefault: true,
  keepDecryptedContent: false,
  autoCleanupExpired: true,
}

export const useGhostNoteStore = create<GhostNoteStore>()(
  persist(
    (set, get) => ({
      ghostNotes: [],
      settings: DEFAULT_SETTINGS,
      unreadCount: 0,
      lastCheckTimestamp: 0,

      // CRUD Actions
      addGhostNote: (note) => {
        const { ghostNotes } = get()
        // Avoid duplicates - check by id, eventId, or dTag for the same owner
        const isDuplicate = ghostNotes.some(
          (n) =>
            n.ownerPubkey === note.ownerPubkey &&
            (n.id === note.id ||
              (note.eventId && n.eventId === note.eventId) ||
              (note.dTag && n.dTag === note.dTag))
        )
        if (!isDuplicate) {
          set({ ghostNotes: [...ghostNotes, note] })
          get().updateUnreadCount()
        }
      },

      updateGhostNote: (id, updates) => {
        const { ghostNotes } = get()
        set({
          ghostNotes: ghostNotes.map((note) =>
            note.id === id ? { ...note, ...updates } : note
          ),
        })
        get().updateUnreadCount()
      },

      removeGhostNote: (id) => {
        const { ghostNotes } = get()
        set({ ghostNotes: ghostNotes.filter((note) => note.id !== id) })
        get().updateUnreadCount()
      },

      // Queries - all filtered by current user
      getGhostNoteById: (id) => {
        const userPubkey = getCurrentUserPubkey()
        return get().ghostNotes.find(
          (note) => note.id === id && note.ownerPubkey === userPubkey
        )
      },

      getGhostNoteByEventId: (eventId) => {
        const userPubkey = getCurrentUserPubkey()
        return get().ghostNotes.find(
          (note) => note.eventId === eventId && note.ownerPubkey === userPubkey
        )
      },

      getGhostNoteByDTag: (dTag) => {
        const userPubkey = getCurrentUserPubkey()
        return get().ghostNotes.find(
          (note) => note.dTag === dTag && note.ownerPubkey === userPubkey
        )
      },

      getGhostNotes: (direction, status) => {
        const { ghostNotes } = get()
        const userPubkey = getCurrentUserPubkey()
        let filtered = ghostNotes.filter(
          (note) => note.direction === direction && note.ownerPubkey === userPubkey
        )
        if (status) {
          filtered = filtered.filter((note) => note.status === status)
        }
        // Sort by createdAt descending (newest first)
        return filtered.sort((a, b) => b.createdAt - a.createdAt)
      },

      getSentGhostNotes: () => {
        return get().getGhostNotes('sent')
      },

      getReceivedGhostNotes: () => {
        return get().getGhostNotes('received')
      },

      getActiveGhostNotes: (direction) => {
        return get().getGhostNotes(direction, 'active')
      },

      // Status updates
      markAsRead: (id) => {
        get().updateGhostNote(id, {
          status: 'read',
          readAt: Math.floor(Date.now() / 1000),
          // Clear both encrypted and decrypted content to prevent re-viewing
          encryptedContent: '',
          decryptedContent: null,
        })
      },

      markAsRevoked: (id) => {
        get().updateGhostNote(id, {
          status: 'revoked',
          revokedAt: Math.floor(Date.now() / 1000),
        })
      },

      markAsExpired: (id) => {
        get().updateGhostNote(id, {
          status: 'expired',
        })
      },

      setDecryptedContent: (id, content) => {
        get().updateGhostNote(id, {
          decryptedContent: content,
        })
      },

      // Settings actions
      updateSettings: (updates) => {
        const { settings } = get()
        set({ settings: { ...settings, ...updates } })
      },

      // Sync state
      setLastCheckTimestamp: (timestamp) => {
        set({ lastCheckTimestamp: timestamp })
      },

      updateUnreadCount: () => {
        const { ghostNotes } = get()
        const userPubkey = getCurrentUserPubkey()
        const count = ghostNotes.filter(
          (note) =>
            note.direction === 'received' &&
            note.status === 'active' &&
            note.ownerPubkey === userPubkey
        ).length
        set({ unreadCount: count })
      },

      // Cleanup
      cleanupExpiredNotes: () => {
        const { ghostNotes } = get()
        const now = Math.floor(Date.now() / 1000)
        let cleanedCount = 0

        const updatedNotes = ghostNotes.map((note) => {
          if (note.status === 'active' && note.expiration < now) {
            cleanedCount++
            return { ...note, status: 'expired' as const }
          }
          return note
        })

        if (cleanedCount > 0) {
          set({ ghostNotes: updatedNotes })
          get().updateUnreadCount()
        }

        return cleanedCount
      },

      clearDecryptedContent: () => {
        const { ghostNotes, settings } = get()
        if (!settings.keepDecryptedContent) {
          set({
            ghostNotes: ghostNotes.map((note) =>
              note.direction === 'received'
                ? { ...note, decryptedContent: null }
                : note
            ),
          })
        }
      },
    }),
    {
      name: 'ghostr-ghost-notes',
      partialize: (state) => ({
        ghostNotes: state.ghostNotes,
        settings: state.settings,
        lastCheckTimestamp: state.lastCheckTimestamp,
      }),
    }
  )
)

// Utility hook for getting unread count
export function useUnreadGhostNoteCount(): number {
  return useGhostNoteStore((state) => state.unreadCount)
}

// Initialize cleanup on app start
export function initializeGhostNoteCleanup(): void {
  const store = useGhostNoteStore.getState()
  if (store.settings.autoCleanupExpired) {
    store.cleanupExpiredNotes()
  }
  store.updateUnreadCount()
}
