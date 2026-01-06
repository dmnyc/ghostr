import { create } from 'zustand'
import type { Submission } from '@/types/submission'

interface SubmissionStore {
  submissions: Submission[]
  archivedIds: Set<string>
  currentSubmissionId: string | null
  isLoading: boolean
  processedIds: Set<string>

  setSubmissions: (submissions: Submission[]) => void
  addSubmission: (submission: Submission) => void
  setCurrentSubmission: (id: string | null) => void
  getCurrentSubmission: () => Submission | null
  markAsApproved: (id: string, publishedEventId: string) => void
  markAsRejected: (id: string) => void
  isProcessed: (id: string) => boolean
  markAsProcessed: (id: string) => void
  removeSubmission: (id: string) => void
  archiveSubmission: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useSubmissionStore = create<SubmissionStore>((set, get) => ({
  submissions: [],
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

    // Also store in localStorage for persistence
    try {
      const stored = localStorage.getItem('ghostr-processed-submissions')
      const ids = stored ? JSON.parse(stored) : []
      if (!ids.includes(id)) {
        ids.push(id)
        localStorage.setItem('ghostr-processed-submissions', JSON.stringify(ids))
      }
    } catch {
      // Ignore storage errors
    }
  },

  removeSubmission: (id) => {
    set((state) => ({
      submissions: state.submissions.filter((s) => s.id !== id),
    }))
  },

  archiveSubmission: (id) => {
    set((state) => {
      const newArchivedIds = new Set(state.archivedIds)
      newArchivedIds.add(id)
      return {
        submissions: state.submissions.filter((s) => s.id !== id),
        archivedIds: newArchivedIds,
      }
    })

    // Persist archived IDs to localStorage
    try {
      const stored = localStorage.getItem('ghostr-archived-submissions')
      const ids = stored ? JSON.parse(stored) : []
      if (!ids.includes(id)) {
        ids.push(id)
        localStorage.setItem('ghostr-archived-submissions', JSON.stringify(ids))
      }
    } catch {
      // Ignore storage errors
    }
  },

  setLoading: (loading) => set({ isLoading: loading }),
}))

// Initialize processed and archived IDs from localStorage
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
