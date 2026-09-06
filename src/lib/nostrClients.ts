import { nip19 } from 'nostr-tools'

export interface NostrClient {
  key: string
  label: string
  /** Build the URL to view a note on this client. Accepts a NIP-19 identifier (note1/nevent1/naddr1). */
  noteUrl: (identifier: string) => string
  /** Build the URL to view a profile on this client. Accepts an npub. */
  profileUrl: (npub: string) => string
}

/**
 * Supported Nostr clients for viewing published posts and profiles.
 * Each uses NIP-19 bech32 encoding (note1/nevent1/naddr1 for notes, npub for profiles).
 */
export const NOTE_CLIENTS: NostrClient[] = [
  {
    key: 'jumble',
    label: 'Jumble',
    noteUrl: (id) => `https://jumble.social/notes/${id}`,
    profileUrl: (npub) => `https://jumble.social/users/${npub}`,
  },
  {
    key: 'primal',
    label: 'Primal',
    noteUrl: (id) => `https://primal.net/e/${id}`,
    profileUrl: (npub) => `https://primal.net/p/${npub}`,
  },
  {
    key: 'nostrudel',
    label: 'noStrudel',
    noteUrl: (id) => `https://nostrudel.ninja/#/n/${id}`,
    profileUrl: (npub) => `https://nostrudel.ninja/#/u/${npub}`,
  },
  {
    key: 'yakihonne',
    label: 'YakiHonne',
    noteUrl: (id) => `https://yakihonne.com/note/${id}`,
    profileUrl: (npub) => `https://yakihonne.com/profile/${npub}`,
  },
  {
    key: 'snort',
    label: 'Snort',
    noteUrl: (id) => `https://snort.social/${id}`,
    profileUrl: (npub) => `https://snort.social/${npub}`,
  },
  {
    key: 'iris',
    label: 'Iris',
    noteUrl: (id) => `https://iris.to/${id}`,
    profileUrl: (npub) => `https://iris.to/${npub}`,
  },
  {
    key: 'njump',
    label: 'njump',
    noteUrl: (id) => `https://njump.me/${id}`,
    profileUrl: (npub) => `https://njump.me/${npub}`,
  },
  {
    key: 'coracle',
    label: 'Coracle',
    noteUrl: (id) => `https://coracle.social/${id}`,
    profileUrl: (npub) => `https://coracle.social/${npub}`,
  },
]

export const DEFAULT_CLIENT_KEY = 'jumble'

/** NIP-19 entities that already address an event and can go straight into a client URL. */
const ENCODED_EVENT_PREFIX = /^(note|nevent|naddr)1[023456789acdefghjklmnpqrstuvwxyz]+$/

/**
 * Normalize an event reference for use in a client URL.
 * Hex event IDs are encoded as note1..., while identifiers that are already
 * NIP-19 encoded (naddr1 for long-form articles, nevent1, note1) pass through.
 */
export function toEventIdentifier(eventIdOrEntity: string): string {
  if (ENCODED_EVENT_PREFIX.test(eventIdOrEntity)) {
    return eventIdOrEntity
  }

  try {
    return nip19.noteEncode(eventIdOrEntity)
  } catch {
    // Not hex and not a recognized entity - use as-is rather than breaking the link
    return eventIdOrEntity
  }
}

/** Get the client object for a key, falling back to the default. */
export function getClient(key?: string): NostrClient {
  return NOTE_CLIENTS.find((c) => c.key === key) ?? NOTE_CLIENTS[0]!
}

/** Build a note-viewing URL for the given client key + hex event ID or NIP-19 entity. */
export function getNoteUrl(eventIdOrEntity: string, clientKey?: string): string {
  return getClient(clientKey).noteUrl(toEventIdentifier(eventIdOrEntity))
}

/** Build a profile-viewing URL for the given client key + npub. */
export function getProfileUrl(npub: string, clientKey?: string): string {
  return getClient(clientKey).profileUrl(npub)
}
