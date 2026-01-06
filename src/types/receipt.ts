export interface ReceiptPayload {
  protocol: 'ghostr_v1'
  type: 'receipt'
  submissionId: string
  action: 'approved' | 'rejected'
  eventId?: string
  feedback?: string
  timestamp: number
}
