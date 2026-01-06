import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { Draft } from '@/types/draft'
import { loadDraftsFromRelay, saveDraftsToRelay } from '@/lib/nostr/nip78'

interface DraftStore {
  drafts: Draft[]
  currentDraftId: string | null
  isLoading: boolean
  isSaving: boolean
  lastSyncedAt: number | null
  error: string | null

  loadDrafts: () => Promise<void>
  saveDrafts: () => Promise<void>
  createDraft: () => Draft
  updateDraft: (id: string, updates: Partial<Draft>) => void
  deleteDraft: (id: string) => void
  setCurrentDraft: (id: string | null) => void
  getCurrentDraft: () => Draft | null
  markAsSubmitted: (id: string, adminNpub: string) => void
  markAsPublished: (id: string, eventId: string) => void
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  drafts: [],
  currentDraftId: null,
  isLoading: false,
  isSaving: false,
  lastSyncedAt: null,
  error: null,

  loadDrafts: async () => {
    set({ isLoading: true, error: null })

    try {
      const drafts = await loadDraftsFromRelay()
      set({
        drafts,
        isLoading: false,
        lastSyncedAt: Date.now(),
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load drafts',
      })
    }
  },

  saveDrafts: async () => {
    const { drafts, isSaving } = get()
    if (isSaving) return

    set({ isSaving: true, error: null })

    try {
      await saveDraftsToRelay(drafts)
      set({
        isSaving: false,
        lastSyncedAt: Date.now(),
      })
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : 'Failed to save drafts',
      })
    }
  },

  createDraft: () => {
    const newDraft: Draft = {
      id: uuidv4(),
      title: '',
      content: '',
      targetKind: 1,
      tags: [],
      status: 'draft',
      updatedAt: Date.now(),
    }

    set((state) => ({
      drafts: [newDraft, ...state.drafts],
      currentDraftId: newDraft.id,
    }))

    return newDraft
  },

  updateDraft: (id, updates) => {
    set((state) => ({
      drafts: state.drafts.map((draft) =>
        draft.id === id
          ? { ...draft, ...updates, updatedAt: Date.now() }
          : draft
      ),
    }))
  },

  deleteDraft: (id) => {
    set((state) => ({
      drafts: state.drafts.filter((draft) => draft.id !== id),
      currentDraftId: state.currentDraftId === id ? null : state.currentDraftId,
    }))
  },

  setCurrentDraft: (id) => {
    set({ currentDraftId: id })
  },

  getCurrentDraft: () => {
    const { drafts, currentDraftId } = get()
    if (!currentDraftId) return null
    return drafts.find((d) => d.id === currentDraftId) ?? null
  },

  markAsSubmitted: (id, adminNpub) => {
    set((state) => ({
      drafts: state.drafts.map((draft) =>
        draft.id === id
          ? { ...draft, status: 'submitted' as const, submittedTo: adminNpub, updatedAt: Date.now() }
          : draft
      ),
    }))
  },

  markAsPublished: (id, eventId) => {
    set((state) => ({
      drafts: state.drafts.map((draft) =>
        draft.id === id
          ? { ...draft, status: 'published' as const, publishedEventId: eventId, updatedAt: Date.now() }
          : draft
      ),
    }))
  },
}))
