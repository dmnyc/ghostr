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
  publishedEventId?: string
  rejectionReason?: string
  coverImage?: string
}

export interface DraftStore {
  drafts: Draft[]
}
