import { create } from 'zustand'
import type { Submission } from '@/types/submission'
import {
  loadProcessedSubmissionsFromRelay,
  saveProcessedSubmissionsToRelay,
  loadArchivedSubmissionsFromRelay,
  saveArchivedSubmissionsToRelay,
} from '@/lib/nostr/nip78'

// Debounce relay saves to avoid excessive publishing
let processedSaveTimeout: ReturnType<typeof setTimeout> | null = null
let archivedSaveTimeout: ReturnType<typeof setTimeout> | null = null

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

interface SubmissionStore {
  submissions: Submission[]
  archivedSubmissions: Submission[]
  archivedIds: Set<string>
  currentSubmissionId: string | null
  isLoading: boolean
  processedIds: Set<string>

  setSubmissions: (submissions: Submission[]) => void
  addSubmission: (submission: Submission) => void
  setCurrentSubmission: (id: string | null) => void
  getCurrentSubmission: () => Submission | null
  updateSubmissionContent: (id: string, content: string) => void
  markAsApproved: (id: string, publishedEventId: string) => void
  markAsRejected: (id: string) => void
  isProcessed: (id: string) => boolean
  markAsProcessed: (id: string) => void
  removeSubmission: (id: string) => void
  archiveSubmission: (id: string) => void
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

  archiveSubmission: (id) => {
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

    // Also save to relay (debounced)
    debouncedSaveArchived(allIds)
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

    const processedIds = storedProcessed ? new Set(JSON.parse(storedProcessed) as string[]) : new Set<string>()
    const archivedIds = storedArchived ? new Set(JSON.parse(storedArchived) as string[]) : new Set<string>()

    useSubmissionStore.setState({
      processedIds,
      archivedIds,
    })
  } catch {
    // Ignore errors
  }
}

// Load processed and archived IDs from relay and merge with localStorage
export async function syncProcessedIdsFromRelay(): Promise<void> {
  try {
    // Load from relay
    const [relayProcessed, relayArchived] = await Promise.all([
      loadProcessedSubmissionsFromRelay().catch(() => [] as string[]),
      loadArchivedSubmissionsFromRelay().catch(() => [] as string[]),
    ])

    // Get current localStorage values
    const storedProcessed = localStorage.getItem('ghostr-processed-submissions')
    const storedArchived = localStorage.getItem('ghostr-archived-submissions')
    const localProcessed = storedProcessed ? (JSON.parse(storedProcessed) as string[]) : []
    const localArchived = storedArchived ? (JSON.parse(storedArchived) as string[]) : []

    // Merge relay + localStorage (union)
    const mergedProcessed = [...new Set([...localProcessed, ...relayProcessed])]
    const mergedArchived = [...new Set([...localArchived, ...relayArchived])]

    // Update localStorage with merged values
    localStorage.setItem('ghostr-processed-submissions', JSON.stringify(mergedProcessed))
    localStorage.setItem('ghostr-archived-submissions', JSON.stringify(mergedArchived))

    // Update store
    useSubmissionStore.setState({
      processedIds: new Set(mergedProcessed),
      archivedIds: new Set(mergedArchived),
    })

    // If relay had fewer items than merged, sync back to relay
    if (relayProcessed.length < mergedProcessed.length) {
      saveProcessedSubmissionsToRelay(mergedProcessed).catch(() => {})
    }
    if (relayArchived.length < mergedArchived.length) {
      saveArchivedSubmissionsToRelay(mergedArchived).catch(() => {})
    }
  } catch {
    // Silently fail - localStorage values are already loaded
  }
}
