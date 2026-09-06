import packageJson from '../../package.json'

export const APP_VERSION = packageJson.version as string

export interface ReleaseNote {
  version: string
  date: string
  highlights: string[]
}

/**
 * Release notes shown in the in-app "What's New" dialog.
 *
 * Add a new entry at the TOP of this array for each release. The dialog opens
 * automatically when APP_VERSION differs from the version the user last
 * dismissed (tracked in localStorage), and is always reachable again from the
 * footer.
 */
export const releaseNotes: ReleaseNote[] = [
  {
    version: '0.9.1',
    date: 'September 6, 2026',
    highlights: [
      'Thread drafting — compose, draft, and submit multi-post threads end to end',
      'Optional 1/N auto-numbering with a live ghost preview in the composer',
      'Post type safety — switching between note and article confirms before reshaping content',
      'Pick which Nostr client opens your published posts and profile links',
      'Fixed the blank page when opening History with a long-form article in it',
      'Long-form drafts from other clients (kind 30024 and NIP-37 wraps) now appear in the publisher Drafts tab, read-only until imported',
      'Dependency and security updates across the board',
    ],
  },
  {
    version: '0.9.0',
    date: 'July 17, 2026',
    highlights: [
      'Modern Noir visual refresh — satin dark palette, velvet gradient surfaces, diamond-checker background',
      'Fraunces display + Geist UI typography (Press Start 2P stays on the wordmark)',
      'Layered elevation with sheen + drop shadows for real depth and dimensionality',
      'Recomposed editor layout — sticky right rail, aligned columns, mobile-optimized action buttons',
      'Stronger primary action buttons with violet gradient + glow',
    ],
  },
  {
    version: '0.8.2',
    date: 'July 15, 2026',
    highlights: [
      'Atomic mention pills — @mentions can\'t be broken by editing, copy/paste, or formatting',
      'Pasted nostr: links (npub/nprofile) become pills automatically',
      'Profile discovery via nostrarchives.com',
      'Rich note previews — inline media, @name mentions, and nostr embeds in the composer and cards',
      'Write/Preview toggle for short notes',
      'Short-note nudge to convert long notes into articles',
      'Centered, enlarged role switcher and a leaner header',
    ],
  },
]

const LAST_SEEN_KEY = 'ghostr-last-seen-release'

export function getLastSeenReleaseVersion(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY)
  } catch {
    return null
  }
}

export function setLastSeenReleaseVersion(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version)
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}
