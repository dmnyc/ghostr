import { NDKEvent } from '@nostr-dev-kit/ndk'
import type { Draft } from '@/types/draft'
import {
  DRAFT_D_TAG,
  DRAFT_KIND,
  PUBLISH_HISTORY_D_TAG,
  PROCESSED_SUBMISSIONS_D_TAG,
  ARCHIVED_SUBMISSIONS_D_TAG,
  EDITED_SUBMISSIONS_D_TAG,
  MAX_PUBLISH_HISTORY_ITEMS,
} from '@/lib/constants'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import type { PublishedItem } from '@/stores/publishHistoryStore'

export async function loadDraftsFromRelay(): Promise<Draft[]> {
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
    // Decrypt content (NIP-44 encrypted to self)
    const decrypted = await signer.decrypt(user, event.content)
    const drafts = JSON.parse(decrypted) as Draft[]
    return drafts
  } catch (error) {
    console.error('Failed to decrypt drafts:', error)
    return []
  }
}

export async function saveDraftsToRelay(drafts: Draft[]): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const content = JSON.stringify(drafts)

  // Encrypt to self
  const encrypted = await signer.encrypt(user, content)

  const event = new NDKEvent(ndk)
  event.kind = DRAFT_KIND
  event.content = encrypted
  event.tags = [['d', DRAFT_D_TAG]]

  await event.publish()
}

// Lightweight version of PublishedItem for relay storage (excludes full content)
interface StoredHistoryItem {
  id: string
  kind: 1 | 30023
  title?: string
  summary?: string // User-provided summary or first 100 chars of content
  dTag?: string
  coverImage?: string
  publishedAt: number
  source: 'direct' | 'delegate'
  delegatePubkey?: string
  delegateNpub?: string
}

function toStoredItem(item: PublishedItem): StoredHistoryItem {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    // Use provided summary, or fallback to first 100 chars of content
    summary: item.summary || item.content.slice(0, 100),
    dTag: item.dTag,
    coverImage: item.coverImage,
    publishedAt: item.publishedAt,
    source: item.source,
    delegatePubkey: item.delegatePubkey,
    delegateNpub: item.delegateNpub,
  }
}

function fromStoredItem(stored: StoredHistoryItem): PublishedItem {
  return {
    id: stored.id,
    kind: stored.kind,
    title: stored.title,
    summary: stored.summary,
    content: stored.summary || '', // Will be empty/truncated, can fetch full from relay if needed
    dTag: stored.dTag,
    coverImage: stored.coverImage,
    publishedAt: stored.publishedAt,
    source: stored.source,
    delegatePubkey: stored.delegatePubkey,
    delegateNpub: stored.delegateNpub,
  }
}

export async function loadPublishHistoryFromRelay(): Promise<PublishedItem[]> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const filter = {
    kinds: [DRAFT_KIND],
    authors: [user.pubkey],
    '#d': [PUBLISH_HISTORY_D_TAG],
  }

  const event = await ndk.fetchEvent(filter)

  if (!event) {
    return []
  }

  try {
    const decrypted = await signer.decrypt(user, event.content)
    const storedItems = JSON.parse(decrypted) as StoredHistoryItem[]
    return storedItems.map(fromStoredItem)
  } catch (error) {
    console.error('Failed to decrypt publish history:', error)
    return []
  }
}

export async function savePublishHistoryToRelay(items: PublishedItem[]): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  // Limit items and convert to storage format
  const storedItems = items
    .slice(0, MAX_PUBLISH_HISTORY_ITEMS)
    .map(toStoredItem)

  const content = JSON.stringify(storedItems)
  const encrypted = await signer.encrypt(user, content)

  const event = new NDKEvent(ndk)
  event.kind = DRAFT_KIND
  event.content = encrypted
  event.tags = [['d', PUBLISH_HISTORY_D_TAG]]

  await event.publish()
}

// Processed submissions (approved/rejected)
export async function loadProcessedSubmissionsFromRelay(): Promise<string[]> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const filter = {
    kinds: [DRAFT_KIND],
    authors: [user.pubkey],
    '#d': [PROCESSED_SUBMISSIONS_D_TAG],
  }

  const event = await ndk.fetchEvent(filter)

  if (!event) {
    return []
  }

  try {
    const decrypted = await signer.decrypt(user, event.content)
    return JSON.parse(decrypted) as string[]
  } catch {
    return []
  }
}

export async function saveProcessedSubmissionsToRelay(ids: string[]): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const content = JSON.stringify(ids)
  const encrypted = await signer.encrypt(user, content)

  const event = new NDKEvent(ndk)
  event.kind = DRAFT_KIND
  event.content = encrypted
  event.tags = [['d', PROCESSED_SUBMISSIONS_D_TAG]]

  await event.publish()
}

// Archived submissions (dismissed without action)
export async function loadArchivedSubmissionsFromRelay(): Promise<string[]> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const filter = {
    kinds: [DRAFT_KIND],
    authors: [user.pubkey],
    '#d': [ARCHIVED_SUBMISSIONS_D_TAG],
  }

  const event = await ndk.fetchEvent(filter)

  if (!event) {
    return []
  }

  try {
    const decrypted = await signer.decrypt(user, event.content)
    return JSON.parse(decrypted) as string[]
  } catch {
    return []
  }
}

export async function saveArchivedSubmissionsToRelay(ids: string[]): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const content = JSON.stringify(ids)
  const encrypted = await signer.encrypt(user, content)

  const event = new NDKEvent(ndk)
  event.kind = DRAFT_KIND
  event.content = encrypted
  event.tags = [['d', ARCHIVED_SUBMISSIONS_D_TAG]]

  await event.publish()
}

// Edited submissions (publisher edits to pending submissions)
export interface EditedSubmissionData {
  id: string // submission ID
  content: string
  title?: string // For kind 30023
  summary?: string // For kind 30023
  coverImage?: string // For kind 30023
  updatedAt: number
}

export async function loadEditedSubmissionsFromRelay(): Promise<Record<string, EditedSubmissionData>> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  const filter = {
    kinds: [DRAFT_KIND],
    authors: [user.pubkey],
    '#d': [EDITED_SUBMISSIONS_D_TAG],
  }

  const event = await ndk.fetchEvent(filter)

  if (!event) {
    return {}
  }

  try {
    const decrypted = await signer.decrypt(user, event.content)
    const edits = JSON.parse(decrypted) as EditedSubmissionData[]
    // Convert array to map keyed by submission ID
    return Object.fromEntries(edits.map((edit) => [edit.id, edit]))
  } catch {
    return {}
  }
}

export async function saveEditedSubmissionsToRelay(edits: Record<string, EditedSubmissionData>): Promise<void> {
  const { ndk } = useNDKStore.getState()
  const { user, signer } = useAuthStore.getState()

  if (!ndk || !user || !signer) {
    throw new Error('Not connected or authenticated')
  }

  // Convert map to array for storage
  const editsArray = Object.values(edits)
  const content = JSON.stringify(editsArray)
  const encrypted = await signer.encrypt(user, content)

  const event = new NDKEvent(ndk)
  event.kind = DRAFT_KIND
  event.content = encrypted
  event.tags = [['d', EDITED_SUBMISSIONS_D_TAG]]

  await event.publish()
}
