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
