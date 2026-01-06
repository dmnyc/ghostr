import { DEFAULT_RELAYS } from '../constants'

export function getDefaultRelays(): string[] {
  return [...DEFAULT_RELAYS]
}

export function getStoredRelays(): string[] {
  try {
    const stored = localStorage.getItem('ghostr-relays')
    if (stored) {
      return JSON.parse(stored) as string[]
    }
  } catch {
    // Ignore parse errors
  }
  return getDefaultRelays()
}

export function saveRelays(relays: string[]): void {
  localStorage.setItem('ghostr-relays', JSON.stringify(relays))
}
