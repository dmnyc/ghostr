import type { NDKEvent } from '@nostr-dev-kit/ndk'
import { LONGFORM_DRAFT_KIND } from '@/lib/constants'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'

/**
 * Drafts written by other Nostr clients, surfaced in the publisher dashboard.
 *
 * Two shapes are supported:
 * - kind 30024: NIP-23 draft long-form content (plaintext)
 * - kind 31234: NIP-37 draft wrap whose decrypted content is the JSON of the
 *   draft event itself (Ghostr's own wraps use a private payload instead and
 *   are handled in nip37.ts)
 *
 * These are surfaced read-only. Editing one imports a copy into Ghostr so the
 * original is never overwritten for the client that owns it.
 */

export interface ExternalDraftSource {
  /** Event kind the draft was found in (30024 or 31234) */
  sourceKind: number
  /** d-tag of the source event */
  dTag: string
  /** Client name from the source event's client tag, when present */
  client?: string
}

/** Fields shared by delegate and publisher drafts, filled in from a foreign event. */
export interface ExternalDraftFields {
  id: string
  title: string
  summary?: string
  content: string
  targetKind: 1 | 30023
  tags: string[][]
  coverImage?: string
  updatedAt: number
  external: ExternalDraftSource
}

const EXTERNAL_ID_PREFIX = 'external:'

/** Synthetic ID for a foreign draft. Prefixed so it can never be used as a Ghostr d-tag. */
export function externalDraftId(sourceKind: number, dTag: string): string {
  return `${EXTERNAL_ID_PREFIX}${sourceKind}:${dTag}`
}

export function isExternalDraftId(id: string): boolean {
  return id.startsWith(EXTERNAL_ID_PREFIX)
}

function tagValue(tags: string[][], name: string): string | undefined {
  const tag = tags.find((t) => t[0] === name)
  return tag?.[1] || undefined
}

/** Map a draft event kind onto the kinds Ghostr can edit. Returns null for anything else. */
function toTargetKind(kind: number | undefined): 1 | 30023 | null {
  if (kind === 1) return 1
  if (kind === 30023 || kind === LONGFORM_DRAFT_KIND) return 30023
  return null
}

interface DraftEventJSON {
  kind?: number
  content?: string
  tags?: string[][]
  created_at?: number
}

function fieldsFromDraftEvent(
  draftEvent: DraftEventJSON,
  source: ExternalDraftSource,
  fallbackUpdatedAt: number
): ExternalDraftFields | null {
  const targetKind = toTargetKind(draftEvent.kind)
  if (targetKind === null) return null

  const tags = Array.isArray(draftEvent.tags) ? draftEvent.tags : []
  const createdAt = typeof draftEvent.created_at === 'number' ? draftEvent.created_at * 1000 : 0

  return {
    id: externalDraftId(source.sourceKind, source.dTag),
    title: tagValue(tags, 'title') ?? '',
    summary: tagValue(tags, 'summary'),
    content: typeof draftEvent.content === 'string' ? draftEvent.content : '',
    targetKind,
    // Only carry over hashtags - the rest are the source client's own bookkeeping
    tags: tags.filter((t) => t[0] === 't'),
    coverImage: tagValue(tags, 'image'),
    updatedAt: Math.max(createdAt, fallbackUpdatedAt),
    external: {
      ...source,
      client: source.client ?? tagValue(tags, 'client'),
    },
  }
}

/**
 * Parse the decrypted content of a foreign NIP-37 wrap (kind 31234).
 * Returns null when the payload is not a draft event Ghostr can display.
 */
export function parseForeignDraftWrap(
  event: NDKEvent,
  decrypted: string
): ExternalDraftFields | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(decrypted)
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const draftEvent = parsed as DraftEventJSON
  if (typeof draftEvent.kind !== 'number') return null

  const dTag = tagValue(event.tags, 'd')
  if (!dTag) return null

  return fieldsFromDraftEvent(
    draftEvent,
    {
      sourceKind: event.kind ?? 31234,
      dTag,
      client: tagValue(event.tags, 'client'),
    },
    (event.created_at ?? 0) * 1000
  )
}

/** Convert a kind 30024 (NIP-23 draft long-form) event into draft fields. */
export function parseLongformDraftEvent(event: NDKEvent): ExternalDraftFields | null {
  const dTag = tagValue(event.tags, 'd')
  if (!dTag) return null
  if (!event.content) return null

  return fieldsFromDraftEvent(
    {
      kind: event.kind,
      content: event.content,
      tags: event.tags,
      created_at: event.created_at,
    },
    {
      sourceKind: LONGFORM_DRAFT_KIND,
      dTag,
      client: tagValue(event.tags, 'client'),
    },
    (event.created_at ?? 0) * 1000
  )
}

/**
 * Decrypt a foreign draft wrap. Tries NIP-44 first, then NIP-04 for clients
 * that still encrypt drafts the old way.
 */
export async function decryptForeignWrap(content: string): Promise<string | null> {
  const { user, signer } = useAuthStore.getState()
  if (!user || !signer) return null

  const withTimeout = (promise: Promise<string>) =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('External draft decrypt timed out')), 15000)
      ),
    ])

  try {
    return await withTimeout(signer.decrypt(user, content, 'nip44'))
  } catch {
    // NIP-04 payloads carry an ?iv= suffix - only worth a second signer round trip for those
    if (!content.includes('?iv=')) return null
    try {
      return await withTimeout(signer.decrypt(user, content, 'nip04'))
    } catch {
      return null
    }
  }
}

/** Fetch the user's kind 30024 long-form drafts (written by other clients). */
export async function fetchLongformDrafts(): Promise<ExternalDraftFields[]> {
  const { ndk } = useNDKStore.getState()
  const { user } = useAuthStore.getState()

  if (!ndk || !user) return []

  const filter = {
    kinds: [LONGFORM_DRAFT_KIND],
    authors: [user.pubkey],
  }

  let events: Set<NDKEvent>
  try {
    events = await Promise.race([
      ndk.fetchEvents(filter, { closeOnEose: true }),
      new Promise<Set<NDKEvent>>((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timeout')), 8000)
      ),
    ])
  } catch (error) {
    console.warn('[ExternalDrafts] kind 30024 fetch failed or timed out:', error)
    return []
  }

  const drafts: ExternalDraftFields[] = []
  for (const event of events) {
    const fields = parseLongformDraftEvent(event)
    if (fields) drafts.push(fields)
  }

  console.log('[ExternalDrafts] Found', drafts.length, 'kind 30024 drafts')
  return drafts
}

/**
 * Foreign drafts the user has already imported, so the imported copy replaces
 * the read-only original in the list.
 */
const IMPORTED_KEY = 'ghostr-imported-external-drafts-publisher'

export function getImportedExternalIds(): Set<string> {
  try {
    const stored = localStorage.getItem(IMPORTED_KEY)
    if (stored) {
      return new Set(JSON.parse(stored) as string[])
    }
  } catch {
    // Ignore storage errors
  }
  return new Set()
}

export function markExternalDraftImported(id: string): void {
  try {
    const ids = getImportedExternalIds()
    ids.add(id)
    localStorage.setItem(IMPORTED_KEY, JSON.stringify([...ids]))
  } catch {
    // Ignore storage errors
  }
}
