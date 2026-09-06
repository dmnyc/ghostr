import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_RELAYS as RELAY_URLS } from '@/lib/constants'

type Role = 'delegate' | 'admin'
type Theme = 'light' | 'dark' | 'system'

interface RelayConfig {
  url: string
  read: boolean
  write: boolean
}

interface SettingsStore {
  // User preferences
  defaultRole: Role
  theme: Theme
  creditGhostr: boolean
  enableBotNotifications: boolean
  noteViewerClient: string

  // Relay configuration
  relays: RelayConfig[]
  useNIP65: boolean
  nip65Relays: RelayConfig[]

  // Actions
  setDefaultRole: (role: Role) => void
  setTheme: (theme: Theme) => void
  setCreditGhostr: (credit: boolean) => void
  setBotNotifications: (enabled: boolean) => void
  setNoteViewerClient: (client: string) => void
  setRelays: (relays: RelayConfig[]) => void
  addRelay: (url: string) => void
  removeRelay: (url: string) => void
  resetToDefaultRelays: () => void
  setUseNIP65: (use: boolean) => void
  setNIP65Relays: (relays: RelayConfig[]) => void
  getActiveRelays: () => RelayConfig[]
}

const DEFAULT_RELAYS: RelayConfig[] = RELAY_URLS.map(url => ({
  url,
  read: true,
  write: true,
}))

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      defaultRole: 'delegate',
      theme: 'dark',
      creditGhostr: true,
      enableBotNotifications: true,
      noteViewerClient: 'jumble',
      relays: DEFAULT_RELAYS,
      useNIP65: true,
      nip65Relays: [],

      setDefaultRole: (role) => set({ defaultRole: role }),

      setTheme: (theme) => {
        set({ theme })
        applyTheme(theme)
      },

      setCreditGhostr: (credit) => set({ creditGhostr: credit }),

      setBotNotifications: (enabled) => set({ enableBotNotifications: enabled }),

      setNoteViewerClient: (client) => set({ noteViewerClient: client }),

      setRelays: (relays) => set({ relays }),

      addRelay: (url) => {
        const { relays } = get()
        if (!relays.find((r) => r.url === url)) {
          set({ relays: [...relays, { url, read: true, write: true }] })
        }
      },

      removeRelay: (url) => {
        const { relays } = get()
        set({ relays: relays.filter((r) => r.url !== url) })
      },

      resetToDefaultRelays: () => set({ relays: DEFAULT_RELAYS }),

      setUseNIP65: (use) => set({ useNIP65: use }),

      setNIP65Relays: (relays) => set({ nip65Relays: relays }),

      getActiveRelays: () => {
        const { useNIP65, nip65Relays, relays } = get()
        if (useNIP65 && nip65Relays.length > 0) {
          return nip65Relays
        }
        return relays
      },
    }),
    {
      name: 'ghostr-settings',
      partialize: (state) => ({
        defaultRole: state.defaultRole,
        theme: state.theme,
        creditGhostr: state.creditGhostr,
        enableBotNotifications: state.enableBotNotifications,
        relays: state.relays,
        useNIP65: state.useNIP65,
        nip65Relays: state.nip65Relays,
      }),
    }
  )
)

// Apply theme to document
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    root.classList.add(systemTheme)
  } else {
    root.classList.add(theme)
  }
}

// Initialize theme on load
export function initializeTheme() {
  const theme = useSettingsStore.getState().theme
  applyTheme(theme)
}
