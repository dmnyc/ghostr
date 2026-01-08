import NDK, { NDKEvent } from '@nostr-dev-kit/ndk'
import type { Draft } from '@/types/draft'
import { NIP37_DRAFT_KIND, DRAFT_KIND, DRAFT_D_TAG } from '@/lib/constants'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'

/**
 * NIP-37: Draft storage using kind 31234 events
 *
 * Each draft is stored as a separate parameterized replaceable event:
 * - kind: 31234
 * - d tag: unique draft ID
 * - k tag: target event kind (1 or 30023)
 * - content: NIP-44 encrypted JSON of draft data
 *
 * Deletion is signaled by publishing with empty content.
 */

// Data stored in encrypted content (excludes 'id' which is in the d-tag)
interface DraftPayload {
  title: string
  content: string
  targetKind: 1 | 30023
  tags: string[][]
  status: 'draft' | 'submitted' | 'published' | 'rejected'
  updatedAt: number
  targetPublisher?: Draft['targetPublisher']
  submittedTo?: string
  lastSubmissionId?: string
  publishedEventId?: string
  rejectionReason?: string
  coverImage?: string
  archived?: boolean
}

function draftToPayload(draft: Draft): DraftPayload {
  return {
    title: draft.title,
    content: draft.content,
    targetKind: draft.targetKind,
    tags: draft.tags,
    status: draft.status,
    updatedAt: draft.updatedAt,
    targetPublisher: draft.targetPublisher,
    submittedTo: draft.submittedTo,
    lastSubmissionId: draft.lastSubmissionId,
    publishedEventId: draft.publishedEventId,
    rejectionReason: draft.rejectionReason,
    coverImage: draft.coverImage,
    archived: draft.archived,
  }
}

function payloadToDraft(id: string, payload: DraftPayload): Draft {
  return {
    id,
    title: payload.title,
    content: payload.content,
    targetKind: payload.targetKind,
    tags: payload.tags,
    status: payload.status,
    updatedAt: payload.updatedAt,
    targetPublisher: payload.targetPublisher,
    submittedTo: payload.submittedTo,
    lastSubmissionId: payload.lastSubmissionId,
    publishedEventId: payload.publishedEventId,
    rejectionReason: payload.rejectionReason,
    coverImage: payload.coverImage,
    archived: payload.archived,
  }
}

/**
 * Wait for at least one relay to be connected
 */
async function waitForRelayConnection(ndk: NDK, timeoutMs: number = 2000): Promise<boolean> {
  const startTime = Date.now()

  // Check immediately first
  for (const relay of ndk.pool.relays.values()) {
    try {
      if (relay.connectivity?.isAvailable?.()) {
        return true
      }
    } catch {
      // Try next relay
    }
  }

  // Poll with shorter interval
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100))

    for (const relay of ndk.pool.relays.values()) {
      try {
        if (relay.connectivity?.isAvailable?.()) {
          return true
        }
      } catch {
        // Try next relay
      }
    }
  }

  // Even if no relay reports connected, we might still be able to fetch
  // (the pool manages connections internally)
  return ndk.pool.relays.size > 0
}

/**
 * Load all drafts from relay using NIP-37 format
 */
export async function loadDraftsNIP37(): Promise<Draft[]> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  // Wait for at least one relay to be ready
  console.log('[NIP-37] Waiting for relay connection...')
  await waitForRelayConnection(ndk)

  // Fetch all NIP-37 drafts by this user (can't filter by #client - relays don't support it well)
  const filter = {
    kinds: [NIP37_DRAFT_KIND],
    authors: [user.pubkey],
  }

  console.log('[NIP-37] Fetching events with filter:', filter)

  // Add timeout to prevent hanging (8 seconds - we have cached data as fallback)
  const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) =>
    setTimeout(() => reject(new Error('Fetch timeout')), 8000)
  )

  let events: Set<NDKEvent>
  try {
    events = await Promise.race([
      ndk.fetchEvents(filter, { closeOnEose: true }),
      timeoutPromise,
    ])
  } catch (error) {
    console.warn('[NIP-37] fetchEvents failed or timed out:', error)
    events = new Set()
  }

  console.log('[NIP-37] fetchEvents returned', events.size, 'events')
  const drafts: Draft[] = []

  for (const event of events) {
    // Skip events with empty content (deleted drafts)
    if (!event.content) continue

    // Only process Ghostr drafts (check for client tag)
    const clientTag = event.tags.find((t) => t[0] === 'client')
    if (!clientTag || clientTag[1] !== 'ghostr') continue

    // Get draft ID from d-tag
    const dTag = event.tags.find((t) => t[0] === 'd')
    if (!dTag || !dTag[1]) continue

    const draftId = dTag[1]

    try {
      // Decrypt content (NIP-44 encrypted to self)
      const decrypted = await signer.decrypt(user, event.content)
      const payload = JSON.parse(decrypted) as DraftPayload
      drafts.push(payloadToDraft(draftId, payload))
    } catch {
      // Skip drafts that fail to decrypt (may be from other clients)
    }
  }

  // Sort by updatedAt descending (newest first)
  drafts.sort((a, b) => b.updatedAt - a.updatedAt)

  return drafts
}

/**
 * Save a single draft to relay using NIP-37 format
 */
export async function saveDraftNIP37(draft: Draft): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const payload = draftToPayload(draft)
  const content = JSON.stringify(payload)

  // Encrypt to self using NIP-44
  const encrypted = await signer.encrypt(user, content)

  const event = new NDKEvent(ndk)
  event.kind = NIP37_DRAFT_KIND
  event.content = encrypted
  event.tags = [
    ['d', draft.id],
    ['k', String(draft.targetKind)],
    ['client', 'ghostr'],
  ]

  await event.publish()
}

/**
 * Delete a draft from relay by publishing with empty content
 */
export async function deleteDraftNIP37(draftId: string, targetKind: 1 | 30023 = 1): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  // Publish event with empty content to signal deletion
  const event = new NDKEvent(ndk)
  event.kind = NIP37_DRAFT_KIND
  event.content = ''
  event.tags = [
    ['d', draftId],
    ['k', String(targetKind)],
    ['client', 'ghostr'],
  ]

  await event.publish()
}

/**
 * Load legacy drafts from NIP-78 format (for migration)
 */
export async function loadLegacyDrafts(): Promise<Draft[]> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const filter = {
    kinds: [DRAFT_KIND],
    authors: [user.pubkey],
    '#d': [DRAFT_D_TAG],
  }

  const event = await ndk.fetchEvent(filter)

  if (!event) {
    return []
  }

  try {
    const decrypted = await signer.decrypt(user, event.content)
    const drafts = JSON.parse(decrypted) as Draft[]
    return drafts
  } catch {
    // Expected if legacy event exists but can't be decrypted (different app or corrupted)
    return []
  }
}

/**
 * Delete the legacy NIP-78 drafts event after migration
 */
export async function deleteLegacyDraftsEvent(): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  // Publish event with empty content to "delete" the legacy drafts
  const event = new NDKEvent(ndk)
  event.kind = DRAFT_KIND
  event.content = ''
  event.tags = [['d', DRAFT_D_TAG]]

  await event.publish()
}

/**
 * Load drafts with automatic migration from legacy format
 */
export async function loadDraftsWithMigration(): Promise<Draft[]> {
  console.log('[NIP-37] Loading drafts...')

  // First, try to load NIP-37 drafts
  const nip37Drafts = await loadDraftsNIP37()
  console.log('[NIP-37] Found', nip37Drafts.length, 'NIP-37 drafts')

  // If we found NIP-37 drafts, we're already migrated
  if (nip37Drafts.length > 0) {
    return nip37Drafts
  }

  // No NIP-37 drafts found, check for legacy NIP-78 drafts
  const legacyDrafts = await loadLegacyDrafts()

  if (legacyDrafts.length > 0) {
    console.log(`Migrating ${legacyDrafts.length} drafts from NIP-78 to NIP-37...`)

    // Migrate each draft to NIP-37 format
    for (const draft of legacyDrafts) {
      try {
        await saveDraftNIP37(draft)
      } catch (error) {
        console.error('Failed to migrate draft:', draft.id, error)
      }
    }

    // Delete the legacy NIP-78 event
    try {
      await deleteLegacyDraftsEvent()
      console.log('Legacy drafts event deleted')
    } catch (error) {
      console.error('Failed to delete legacy drafts event:', error)
    }

    return legacyDrafts
  }

  // No drafts found anywhere
  return []
}
