import { nip19 } from 'nostr-tools'

export interface NostrClient {
  key: string
  label: string
  /** Build the URL to view a note on this client. Accepts a hex event ID. */
  noteUrl: (eventId: string) => string
  /** Build the URL to view a profile on this client. Accepts an npub. */
  profileUrl: (npub: string) => string
}

/**
 * Supported Nostr clients for viewing published posts and profiles.
 * Each uses NIP-19 bech32 encoding (note1/nevent1 for notes, npub for profiles).
 */
export const NOTE_CLIENTS: NostrClient[] = [
  {
    key: 'jumble',
    label: 'Jumble',
    noteUrl: (id) => `https://jumble.social/notes/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://jumble.social/users/${npub}`,
  },
  {
    key: 'primal',
    label: 'Primal',
    noteUrl: (id) => `https://primal.net/e/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://primal.net/p/${npub}`,
  },
  {
    key: 'nostrudel',
    label: 'noStrudel',
    noteUrl: (id) => `https://nostrudel.ninja/#/n/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://nostrudel.ninja/#/u/${npub}`,
  },
  {
    key: 'yakihonne',
    label: 'YakiHonne',
    noteUrl: (id) => `https://yakihonne.com/note/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://yakihonne.com/profile/${npub}`,
  },
  {
    key: 'snort',
    label: 'Snort',
    noteUrl: (id) => `https://snort.social/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://snort.social/${npub}`,
  },
  {
    key: 'iris',
    label: 'Iris',
    noteUrl: (id) => `https://iris.to/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://iris.to/${npub}`,
  },
  {
    key: 'njump',
    label: 'njump',
    noteUrl: (id) => `https://njump.me/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://njump.me/${npub}`,
  },
  {
    key: 'coracle',
    label: 'Coracle',
    noteUrl: (id) => `https://coracle.social/${nip19.noteEncode(id)}`,
    profileUrl: (npub) => `https://coracle.social/${npub}`,
  },
]

export const DEFAULT_CLIENT_KEY = 'jumble'

/** Get the client object for a key, falling back to the default. */
export function getClient(key?: string): NostrClient {
  return NOTE_CLIENTS.find((c) => c.key === key) ?? NOTE_CLIENTS[0]!
}

/** Build a note-viewing URL for the given client key + hex event ID. */
export function getNoteUrl(eventId: string, clientKey?: string): string {
  return getClient(clientKey).noteUrl(eventId)
}

/** Build a profile-viewing URL for the given client key + npub. */
export function getProfileUrl(npub: string, clientKey?: string): string {
  return getClient(clientKey).profileUrl(npub)
}
