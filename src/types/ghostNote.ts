// Ghost Note Types
// Ephemeral encrypted secrets for Ghostr

export const GHOST_NOTE_KIND = 30079

export type GhostNoteStatus = 'active' | 'read' | 'revoked' | 'expired'
export type GhostNoteDirection = 'sent' | 'received'

export interface GhostNote {
  id: string
  eventId: string | null
  dTag: string
  ownerPubkey: string // The user who owns this note (sender for sent, recipient for received)
  direction: GhostNoteDirection
  counterpartyPubkey: string
  encryptedContent: string
  decryptedContent: string | null
  createdAt: number
  expiration: number
  status: GhostNoteStatus
  readAt: number | null
  revokedAt: number | null
  relayUrls: string[]
  notificationEnabled: boolean
  metadata?: Record<string, unknown>
}

export interface GhostNoteCreateInput {
  recipientPubkey: string
  content: string
  expirationSeconds: number
  notifyOnRead: boolean
}

export interface GhostNoteResult {
  success: boolean
  ghostNote?: GhostNote
  error?: string
  link?: string
}

export interface GhostNoteReadResult {
  success: boolean
  plaintext?: string
  error?: string
}

export interface GhostNoteRevocationResult {
  success: boolean
  deletedFromRelays: string[]
  failedRelays: string[]
  error?: string
}

export interface GhostNoteCleanupResult {
  expiredCount: number
  cleanedCount: number
  failedCount: number
}

// Expiration options in seconds
export const EXPIRATION_OPTIONS = [
  { label: '1 hour', seconds: 3600 },
  { label: '6 hours', seconds: 21600, default: true },
  { label: '12 hours', seconds: 43200 },
  { label: '24 hours', seconds: 86400 },
] as const

export const DEFAULT_EXPIRATION_SECONDS = 21600 // 6 hours

// Error messages
export const GHOST_NOTE_ERRORS = {
  INVALID_RECIPIENT: 'Invalid recipient npub. Please check and try again.',
  ENCRYPTION_FAILED: 'Failed to encrypt message. Please try again.',
  PUBLISH_FAILED: 'Could not send Ghost Note. Check your relay connections.',
  NOT_FOUND: 'Ghost Note not found. It may have been revoked or expired.',
  WRONG_RECIPIENT: 'This Ghost Note is not addressed to you.',
  EXPIRED: 'This Ghost Note has expired and is no longer available.',
  DECRYPTION_FAILED: 'Could not decrypt message. The content may be corrupted.',
  REVOKE_FAILED: 'Failed to revoke Ghost Note. Please try again.',
  NO_RELAYS: 'No relays configured. Please add relays in settings.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  CONTENT_TOO_LONG: 'Message is too long. Maximum 500 characters.',
  CONTENT_EMPTY: 'Please enter a message.',
  NOT_AUTHENTICATED: 'Please log in to use Ghost Notes.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
} as const
