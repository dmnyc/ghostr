export interface Draft {
  id: string
  title: string
  content: string
  targetKind: 1 | 30023
  tags: string[][]
  status: 'draft' | 'submitted' | 'published'
  updatedAt: number
  submittedTo?: string
  publishedEventId?: string
}

export interface DraftStore {
  drafts: Draft[]
}
