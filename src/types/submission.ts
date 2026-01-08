export interface SubmissionPayload {
  protocol: 'ghostr_v1'
  type: 'submission'
  id: string
  content: string
  kind: 1 | 30023
  tags: string[][]
  note: string
}

export interface Submission {
  id: string
  delegateNpub: string
  delegatePubkey: string
  content: string
  kind: 1 | 30023
  tags: string[][]
  note: string
  receivedAt: number
  status: 'pending' | 'approved' | 'rejected' | 'archived'
  giftWrapEventId: string
}
