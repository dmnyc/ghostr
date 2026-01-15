import { NDKEvent, NDKUser, type NDKSigner } from '@nostr-dev-kit/ndk'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import {
  GHOST_NOTE_KIND,
  GHOST_NOTE_ERRORS,
  type GhostNote,
  type GhostNoteCreateInput,
  type GhostNoteResult,
  type GhostNoteReadResult,
  type GhostNoteRevocationResult,
} from '@/types/ghostNote'
import { sendBotNotification } from '@/lib/nostr/nip04'
import { v4 as uuidv4 } from 'uuid'

/**
 * Generate a unique d-tag for a Ghost Note
 */
export function generateGhostNoteDTag(): string {
  const timestamp = Date.now()
  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `ghost_${timestamp}_${randomHex}`
}

/**
 * Generate a shareable URL for a Ghost Note
 */
export function generateGhostNoteURL(dTag: string): string {
  // Use the app's base URL or a default
  const baseUrl = window.location.origin
  return `${baseUrl}/note/${dTag}`
}

/**
 * Extract d-tag from a Ghost Note URL
 */
export function extractDTagFromURL(url: string): string | null {
  const match = url.match(/\/note\/([^/?#]+)/)
  return match?.[1] ?? null
}

/**
 * Encrypt content for a Ghost Note using NIP-44
 */
async function encryptGhostNote(
  content: string,
  recipientPubkey: string,
  signer: NDKSigner
): Promise<string> {
  const recipient = new NDKUser({ pubkey: recipientPubkey })
  // NDK signer uses NIP-44 by default for encryption
  return await signer.encrypt(recipient, content)
}

/**
 * Decrypt Ghost Note content using NIP-44
 */
async function decryptGhostNote(
  encryptedContent: string,
  senderPubkey: string,
  signer: NDKSigner
): Promise<string> {
  const sender = new NDKUser({ pubkey: senderPubkey })
  return await signer.decrypt(sender, encryptedContent)
}

/**
 * Validate Ghost Note input before creation
 */
function validateGhostNoteInput(input: GhostNoteCreateInput): void {
  // Check content
  if (!input.content || input.content.trim().length === 0) {
    throw new Error(GHOST_NOTE_ERRORS.CONTENT_EMPTY)
  }
  if (input.content.length > 500) {
    throw new Error(GHOST_NOTE_ERRORS.CONTENT_TOO_LONG)
  }

  // Check recipient pubkey (64 char hex)
  if (!/^[0-9a-f]{64}$/i.test(input.recipientPubkey)) {
    throw new Error(GHOST_NOTE_ERRORS.INVALID_RECIPIENT)
  }

  // Check expiration
  if (input.expirationSeconds <= 0) {
    throw new Error('Expiration must be positive')
  }
}

/**
 * Create and publish a Ghost Note
 */
export async function createGhostNote(
  input: GhostNoteCreateInput
): Promise<GhostNoteResult> {
  const { ndk, connectedRelays } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    return { success: false, error: GHOST_NOTE_ERRORS.NOT_AUTHENTICATED }
  }

  if (connectedRelays.length === 0) {
    return { success: false, error: GHOST_NOTE_ERRORS.NO_RELAYS }
  }

  try {
    // Validate input
    validateGhostNoteInput(input)

    // Generate unique identifiers
    const id = uuidv4()
    const dTag = generateGhostNoteDTag()
    const now = Math.floor(Date.now() / 1000)
    const expiration = now + input.expirationSeconds

    // Encrypt the content
    const encryptedContent = await encryptGhostNote(
      input.content,
      input.recipientPubkey,
      signer
    )

    // Build the event
    const event = new NDKEvent(ndk)
    event.kind = GHOST_NOTE_KIND
    event.content = encryptedContent
    event.created_at = now
    event.tags = [
      ['d', dTag],
      ['p', input.recipientPubkey],
      ['expiration', expiration.toString()],
      ['client', 'ghostr'],
      ['t', 'ghost-note'],
    ]

    // Sign and publish
    await event.sign(signer)

    // Publish with timeout
    const publishPromise = event.publish()
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, 5000)
    )
    await Promise.race([publishPromise, timeoutPromise])

    // Create the GhostNote record
    const ghostNote: GhostNote = {
      id,
      eventId: event.id || null,
      dTag,
      ownerPubkey: user.pubkey, // The sender owns this note
      direction: 'sent',
      counterpartyPubkey: input.recipientPubkey,
      encryptedContent,
      decryptedContent: input.content, // We keep the original for sent notes
      createdAt: now,
      expiration,
      status: 'active',
      readAt: null,
      revokedAt: null,
      relayUrls: [...connectedRelays],
      notificationEnabled: input.notifyOnRead,
    }

    const link = generateGhostNoteURL(dTag)

    // Send bot notification to recipient
    const expirationHours = Math.floor(input.expirationSeconds / 3600)
    const expirationText = expirationHours >= 24
      ? `${Math.floor(expirationHours / 24)} day${Math.floor(expirationHours / 24) > 1 ? 's' : ''}`
      : `${expirationHours} hour${expirationHours > 1 ? 's' : ''}`

    sendBotNotification(
      input.recipientPubkey,
      `👻 You have a new Ghost Note! Someone sent you an encrypted secret message that expires in ${expirationText}. Login to Ghostr to read it before it self-destructs: ${link}`
    )

    return { success: true, ghostNote, link }
  } catch (error) {
    console.error('[GhostNote] Create failed:', error)
    const message =
      error instanceof Error ? error.message : GHOST_NOTE_ERRORS.UNKNOWN_ERROR
    return { success: false, error: message }
  }
}

/**
 * Read and decrypt a received Ghost Note
 */
export async function readGhostNote(
  _eventId: string,
  encryptedContent: string,
  senderPubkey: string
): Promise<GhostNoteReadResult> {
  const { signer } = useAuthStore.getState()

  if (!signer) {
    return { success: false, error: GHOST_NOTE_ERRORS.NOT_AUTHENTICATED }
  }

  try {
    const plaintext = await decryptGhostNote(
      encryptedContent,
      senderPubkey,
      signer
    )
    return { success: true, plaintext }
  } catch (error) {
    console.error('[GhostNote] Decrypt failed:', error)
    return { success: false, error: GHOST_NOTE_ERRORS.DECRYPTION_FAILED }
  }
}

/**
 * Revoke a Ghost Note by publishing a deletion event
 */
export async function revokeGhostNote(
  eventId: string,
  relayUrls: string[]
): Promise<GhostNoteRevocationResult> {
  const { ndk } = useNDKStore.getState()
  const { signer } = useAuthStore.getState()

  if (!ndk || !signer) {
    return {
      success: false,
      deletedFromRelays: [],
      failedRelays: relayUrls,
      error: GHOST_NOTE_ERRORS.NOT_AUTHENTICATED,
    }
  }

  try {
    // Create kind 5 deletion event
    const deletionEvent = new NDKEvent(ndk)
    deletionEvent.kind = 5
    deletionEvent.content = 'Ghost Note revoked by sender'
    deletionEvent.created_at = Math.floor(Date.now() / 1000)
    deletionEvent.tags = [['e', eventId]]

    await deletionEvent.sign(signer)

    // Publish with timeout
    const publishPromise = deletionEvent.publish()
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, 5000)
    )
    await Promise.race([publishPromise, timeoutPromise])

    // For now, assume all relays received it (we can't easily track per-relay)
    return {
      success: true,
      deletedFromRelays: relayUrls,
      failedRelays: [],
    }
  } catch (error) {
    console.error('[GhostNote] Revoke failed:', error)
    return {
      success: false,
      deletedFromRelays: [],
      failedRelays: relayUrls,
      error: GHOST_NOTE_ERRORS.REVOKE_FAILED,
    }
  }
}

/**
 * Send a read receipt for a Ghost Note using the Ghostr bot
 */
export function sendReadReceipt(
  _ghostNoteEventId: string,
  senderPubkey: string
): void {
  const readTime = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  sendBotNotification(
    senderPubkey,
    `👻 Your Ghost Note was read on ${readTime}. The message has self-destructed and can no longer be viewed.`
  )

  console.log('[GhostNote] Read receipt sent to', senderPubkey.slice(0, 8))
}

/**
 * Fetch Ghost Notes addressed to the current user
 */
export async function fetchReceivedGhostNotes(
  since?: number
): Promise<NDKEvent[]> {
  const { ndk } = useNDKStore.getState()
  const { user } = useAuthStore.getState()

  if (!ndk || !user) {
    return []
  }

  const filter = {
    kinds: [GHOST_NOTE_KIND],
    '#p': [user.pubkey],
    '#t': ['ghost-note'],
    ...(since ? { since } : {}),
  }

  try {
    const events = await ndk.fetchEvents(filter)
    return Array.from(events)
  } catch (error) {
    console.error('[GhostNote] Failed to fetch received notes:', error)
    return []
  }
}

/**
 * Fetch a Ghost Note by d-tag
 */
export async function fetchGhostNoteByDTag(
  dTag: string
): Promise<NDKEvent | null> {
  const { ndk } = useNDKStore.getState()

  if (!ndk) {
    return null
  }

  const filter = {
    kinds: [GHOST_NOTE_KIND],
    '#d': [dTag],
    '#t': ['ghost-note'],
  }

  try {
    const events = await ndk.fetchEvents(filter)
    const eventsArray = Array.from(events)
    return eventsArray[0] || null
  } catch (error) {
    console.error('[GhostNote] Failed to fetch by d-tag:', error)
    return null
  }
}

/**
 * Check if a Ghost Note has expired
 */
export function isGhostNoteExpired(expiration: number): boolean {
  const now = Math.floor(Date.now() / 1000)
  return expiration < now
}

/**
 * Format expiration timestamp for display
 */
export function formatExpiration(expirationTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const remaining = expirationTimestamp - now

  if (remaining < 0) {
    return 'Expired'
  }

  if (remaining < 60) {
    return 'Less than a minute'
  }

  if (remaining < 3600) {
    const minutes = Math.floor(remaining / 60)
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  if (remaining < 86400) {
    const hours = Math.floor(remaining / 3600)
    return `${hours} hour${hours !== 1 ? 's' : ''}`
  }

  const days = Math.floor(remaining / 86400)
  return `${days} day${days !== 1 ? 's' : ''}`
}

/**
 * Format expiration as a specific date/time
 */
export function formatExpirationDateTime(expirationTimestamp: number): string {
  const date = new Date(expirationTimestamp * 1000)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
