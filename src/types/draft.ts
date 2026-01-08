export interface DraftPublisher {
  pubkey: string
  npub: string
  name?: string
  displayName?: string
  picture?: string
  nip05?: string
}

export interface Draft {
  id: string
  title: string
  content: string
  targetKind: 1 | 30023
  tags: string[][]
  status: 'draft' | 'submitted' | 'published' | 'rejected'
  updatedAt: number
  targetPublisher?: DraftPublisher
  submittedTo?: string
  lastSubmissionId?: string // ID sent to publisher, used to match receipts
  publishedEventId?: string
  rejectionReason?: string
  coverImage?: string
  archived?: boolean
}

export interface DraftStore {
  drafts: Draft[]
}
