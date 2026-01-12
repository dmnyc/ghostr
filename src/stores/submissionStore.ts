import { create } from 'zustand'
import type { Submission } from '@/types/submission'
import {
  loadProcessedSubmissionsFromRelay,
  saveProcessedSubmissionsToRelay,
  loadArchivedSubmissionsFromRelay,
  saveArchivedSubmissionsToRelay,
  loadEditedSubmissionsFromRelay,
  saveEditedSubmissionsToRelay,
  type EditedSubmissionData,
} from '@/lib/nostr/nip78'

// Debounce relay saves to avoid excessive publishing
let processedSaveTimeout: ReturnType<typeof setTimeout> | null = null
let archivedSaveTimeout: ReturnType<typeof setTimeout> | null = null
let editedSubmissionsSaveTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSaveProcessed(ids: string[]) {
  if (processedSaveTimeout) clearTimeout(processedSaveTimeout)
  processedSaveTimeout = setTimeout(() => {
    saveProcessedSubmissionsToRelay(ids).catch(() => {
      // Silently fail - localStorage is the primary store
    })
  }, 2000)
}

function debouncedSaveArchived(ids: string[]) {
  if (archivedSaveTimeout) clearTimeout(archivedSaveTimeout)
  archivedSaveTimeout = setTimeout(() => {
    saveArchivedSubmissionsToRelay(ids).catch(() => {
      // Silently fail - localStorage is the primary store
    })
  }, 2000)
}

function debouncedSaveEditedSubmissions(edits: Record<string, EditedSubmissionData>) {
  if (editedSubmissionsSaveTimeout) clearTimeout(editedSubmissionsSaveTimeout)
  editedSubmissionsSaveTimeout = setTimeout(() => {
    saveEditedSubmissionsToRelay(edits).catch(() => {
      // Silently fail - localStorage is the primary store
    })
  }, 3000) // 3s debounce like draft editor
}

interface SubmissionStore {
  submissions: Submission[]
  archivedSubmissions: Submission[]
  archivedIds: Set<string>
  currentSubmissionId: string | null
  isLoading: boolean
  processedIds: Set<string>
  editedSubmissions: Record<string, EditedSubmissionData>

  setSubmissions: (submissions: Submission[]) => void
  addSubmission: (submission: Submission) => void
  setCurrentSubmission: (id: string | null) => void
  getCurrentSubmission: () => Submission | null
  updateSubmissionContent: (id: string, content: string) => void
  updateSubmissionEdits: (id: string, edits: Partial<Omit<EditedSubmissionData, 'id' | 'updatedAt'>>) => void
  getSubmissionEdits: (id: string) => EditedSubmissionData | null
  clearSubmissionEdits: (id: string) => void
  markAsApproved: (id: string, publishedEventId: string) => void
  markAsRejected: (id: string) => void
  isProcessed: (id: string) => boolean
  markAsProcessed: (id: string) => void
  removeSubmission: (id: string) => void
  archiveSubmission: (id: string) => Promise<void>
  unarchiveSubmission: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useSubmissionStore = create<SubmissionStore>((set, get) => ({
  submissions: [],
  archivedSubmissions: [],
  archivedIds: new Set(),
  currentSubmissionId: null,
  isLoading: false,
  processedIds: new Set(),
  editedSubmissions: {},

  setSubmissions: (submissions) => set({ submissions }),

  addSubmission: (submission) => {
    const { submissions, processedIds, archivedIds } = get()

    // Check for duplicates, already processed, or archived
    if (
      submissions.some((s) => s.id === submission.id) ||
      processedIds.has(submission.id) ||
      archivedIds.has(submission.id)
    ) {
      return
    }

    set({ submissions: [submission, ...submissions] })
  },

  setCurrentSubmission: (id) => set({ currentSubmissionId: id }),

  getCurrentSubmission: () => {
    const { submissions, currentSubmissionId } = get()
    if (!currentSubmissionId) return null
    return submissions.find((s) => s.id === currentSubmissionId) ?? null
  },

  updateSubmissionContent: (id, content) => {
    set((state) => ({
      submissions: state.submissions.map((s) =>
        s.id === id ? { ...s, content } : s
      ),
    }))
  },

  updateSubmissionEdits: (id, edits) => {
    const { editedSubmissions } = get()
    const existing = editedSubmissions[id] || { id, content: '', updatedAt: Date.now() }

    const updated = {
      ...existing,
      ...edits,
      updatedAt: Date.now(),
    }

    const newEdits = { ...editedSubmissions, [id]: updated }
    set({ editedSubmissions: newEdits })

    // Save to localStorage immediately
    try {
      localStorage.setItem('ghostr-edited-submissions', JSON.stringify(newEdits))
    } catch {
      // Ignore storage errors
    }

    // Debounced save to relay
    debouncedSaveEditedSubmissions(newEdits)
  },

  getSubmissionEdits: (id) => {
    return get().editedSubmissions[id] || null
  },

  clearSubmissionEdits: (id) => {
    const { editedSubmissions } = get()
    const newEdits = { ...editedSubmissions }
    delete newEdits[id]

    set({ editedSubmissions: newEdits })

    // Save to localStorage
    try {
      localStorage.setItem('ghostr-edited-submissions', JSON.stringify(newEdits))
    } catch {
      // Ignore storage errors
    }

    // Save to relay
    debouncedSaveEditedSubmissions(newEdits)
  },

  markAsApproved: (id, _publishedEventId) => {
    set((state) => ({
      submissions: state.submissions.map((s) =>
        s.id === id ? { ...s, status: 'approved' as const } : s
      ),
    }))
    get().markAsProcessed(id)
  },

  markAsRejected: (id) => {
    set((state) => ({
      submissions: state.submissions.map((s) =>
        s.id === id ? { ...s, status: 'rejected' as const } : s
      ),
    }))
    get().markAsProcessed(id)
  },

  isProcessed: (id) => get().processedIds.has(id),

  markAsProcessed: (id) => {
    set((state) => {
      const newProcessedIds = new Set(state.processedIds)
      newProcessedIds.add(id)
      return { processedIds: newProcessedIds }
    })

    // Store in localStorage for persistence
    let allIds: string[] = []
    try {
      const stored = localStorage.getItem('ghostr-processed-submissions')
      allIds = stored ? JSON.parse(stored) : []
      if (!allIds.includes(id)) {
        allIds.push(id)
        localStorage.setItem('ghostr-processed-submissions', JSON.stringify(allIds))
      }
    } catch {
      // Ignore storage errors
    }

    // Also save to relay (debounced)
    debouncedSaveProcessed(allIds)
  },

  removeSubmission: (id) => {
    set((state) => ({
      submissions: state.submissions.filter((s) => s.id !== id),
    }))
  },

  archiveSubmission: async (id) => {
    const { submissions } = get()
    const submission = submissions.find((s) => s.id === id)

    set((state) => {
      const newArchivedIds = new Set(state.archivedIds)
      newArchivedIds.add(id)
      return {
        submissions: state.submissions.filter((s) => s.id !== id),
        archivedSubmissions: submission
          ? [...state.archivedSubmissions, { ...submission, status: 'archived' as const }]
          : state.archivedSubmissions,
        archivedIds: newArchivedIds,
      }
    })

    // Persist archived IDs to localStorage
    let allIds: string[] = []
    try {
      const stored = localStorage.getItem('ghostr-archived-submissions')
      allIds = stored ? JSON.parse(stored) : []
      if (!allIds.includes(id)) {
        allIds.push(id)
        localStorage.setItem('ghostr-archived-submissions', JSON.stringify(allIds))
      }
    } catch {
      // Ignore storage errors
    }

    // Save to relay immediately (no debouncing for archive status)
    try {
      await saveArchivedSubmissionsToRelay(allIds)
    } catch (error) {
      console.error('[SubmissionStore] Failed to save archived status to relay:', error)
    }
  },

  unarchiveSubmission: (id) => {
    const { archivedSubmissions } = get()
    const submission = archivedSubmissions.find((s) => s.id === id)

    set((state) => {
      const newArchivedIds = new Set(state.archivedIds)
      newArchivedIds.delete(id)
      return {
        submissions: submission
          ? [{ ...submission, status: 'pending' as const }, ...state.submissions]
          : state.submissions,
        archivedSubmissions: state.archivedSubmissions.filter((s) => s.id !== id),
        archivedIds: newArchivedIds,
      }
    })

    // Update localStorage
    let allIds: string[] = []
    try {
      const stored = localStorage.getItem('ghostr-archived-submissions')
      allIds = stored ? JSON.parse(stored) : []
      allIds = allIds.filter((i) => i !== id)
      localStorage.setItem('ghostr-archived-submissions', JSON.stringify(allIds))
    } catch {
      // Ignore storage errors
    }

    // Also save to relay (debounced)
    debouncedSaveArchived(allIds)
  },

  setLoading: (loading) => set({ isLoading: loading }),
}))

// Initialize processed and archived IDs from localStorage (synchronous, immediate)
export function initializeProcessedIds(): void {
  try {
    const storedProcessed = localStorage.getItem('ghostr-processed-submissions')
    const storedArchived = localStorage.getItem('ghostr-archived-submissions')
    const storedEdited = localStorage.getItem('ghostr-edited-submissions')

    const processedIds = storedProcessed ? new Set(JSON.parse(storedProcessed) as string[]) : new Set<string>()
    const archivedIds = storedArchived ? new Set(JSON.parse(storedArchived) as string[]) : new Set<string>()
    const editedSubmissions = storedEdited ? (JSON.parse(storedEdited) as Record<string, EditedSubmissionData>) : {}

    useSubmissionStore.setState({
      processedIds,
      archivedIds,
      editedSubmissions,
    })
  } catch {
    // Ignore errors
  }
}

// Load processed and archived IDs from relay and merge with localStorage
export async function syncProcessedIdsFromRelay(): Promise<void> {
  try {
    // Load from relay
    const [relayProcessed, relayArchived, relayEdited] = await Promise.all([
      loadProcessedSubmissionsFromRelay().catch(() => [] as string[]),
      loadArchivedSubmissionsFromRelay().catch(() => [] as string[]),
      loadEditedSubmissionsFromRelay().catch(() => ({}) as Record<string, EditedSubmissionData>),
    ])

    // Get current localStorage values
    const storedProcessed = localStorage.getItem('ghostr-processed-submissions')
    const storedArchived = localStorage.getItem('ghostr-archived-submissions')
    const storedEdited = localStorage.getItem('ghostr-edited-submissions')
    const localProcessed = storedProcessed ? (JSON.parse(storedProcessed) as string[]) : []
    const localArchived = storedArchived ? (JSON.parse(storedArchived) as string[]) : []
    const localEdited = storedEdited ? (JSON.parse(storedEdited) as Record<string, EditedSubmissionData>) : {}

    // Merge relay + localStorage (union)
    const mergedProcessed = [...new Set([...localProcessed, ...relayProcessed])]
    const mergedArchived = [...new Set([...localArchived, ...relayArchived])]

    // For edited submissions, use relay version if newer, otherwise keep local
    const mergedEdited: Record<string, EditedSubmissionData> = { ...relayEdited }
    Object.entries(localEdited).forEach(([id, localEdit]) => {
      const relayEdit = relayEdited[id]
      if (!relayEdit || localEdit.updatedAt > relayEdit.updatedAt) {
        mergedEdited[id] = localEdit
      }
    })

    // Update localStorage with merged values
    localStorage.setItem('ghostr-processed-submissions', JSON.stringify(mergedProcessed))
    localStorage.setItem('ghostr-archived-submissions', JSON.stringify(mergedArchived))
    localStorage.setItem('ghostr-edited-submissions', JSON.stringify(mergedEdited))

    // Update store
    useSubmissionStore.setState({
      processedIds: new Set(mergedProcessed),
      archivedIds: new Set(mergedArchived),
      editedSubmissions: mergedEdited,
    })

    // If relay had fewer items than merged, sync back to relay
    if (relayProcessed.length < mergedProcessed.length) {
      saveProcessedSubmissionsToRelay(mergedProcessed).catch(() => {})
    }
    if (relayArchived.length < mergedArchived.length) {
      saveArchivedSubmissionsToRelay(mergedArchived).catch(() => {})
    }
    if (Object.keys(relayEdited).length < Object.keys(mergedEdited).length) {
      saveEditedSubmissionsToRelay(mergedEdited).catch(() => {})
    }
  } catch {
    // Silently fail - localStorage values are already loaded
  }
}
