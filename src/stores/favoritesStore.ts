import { create } from 'zustand'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useNDKStore } from './ndkStore'
import { useAuthStore } from './authStore'
import { FAVORITES_D_TAG, DRAFT_KIND } from '@/lib/constants'
import type { SearchProfile } from '@/services/profileSearchService'

interface FavoriteProfile {
  pubkey: string
  npub: string
  name?: string
  displayName?: string
  picture?: string
  nip05?: string
}

interface FavoritesStore {
  favorites: FavoriteProfile[]
  isLoading: boolean
  isLoaded: boolean

  // Actions
  loadFavorites: () => Promise<void>
  saveFavorites: () => Promise<void>
  addFavorite: (profile: SearchProfile) => Promise<void>
  removeFavorite: (pubkey: string) => Promise<void>
  isFavorite: (pubkey: string) => boolean
  clearFavorites: () => void
}

export const useFavoritesStore = create<FavoritesStore>()((set, get) => ({
  favorites: [],
  isLoading: false,
  isLoaded: false,

  loadFavorites: async () => {
    const { ndk } = useNDKStore.getState()
    const { user, signer } = useAuthStore.getState()

    if (!ndk || !user || !signer) {
      console.warn('[FavoritesStore] Not connected or authenticated')
      return
    }

    set({ isLoading: true })

    try {
      const filter = {
        kinds: [DRAFT_KIND],
        authors: [user.pubkey],
        '#d': [FAVORITES_D_TAG],
      }

      const event = await ndk.fetchEvent(filter)

      if (!event) {
        set({ favorites: [], isLoading: false, isLoaded: true })
        return
      }

      // Decrypt content (NIP-44 encrypted to self)
      const decrypted = await signer.decrypt(user, event.content)
      const favorites = JSON.parse(decrypted) as FavoriteProfile[]

      set({ favorites, isLoading: false, isLoaded: true })
    } catch (error) {
      console.error('[FavoritesStore] Failed to load favorites:', error)
      set({ favorites: [], isLoading: false, isLoaded: true })
    }
  },

  saveFavorites: async () => {
    const { ndk } = useNDKStore.getState()
    const { user, signer } = useAuthStore.getState()
    const { favorites } = get()

    if (!ndk || !user || !signer) {
      throw new Error('Not connected or authenticated')
    }

    const content = JSON.stringify(favorites)

    // Encrypt to self
    const encrypted = await signer.encrypt(user, content)

    const event = new NDKEvent(ndk)
    event.kind = DRAFT_KIND
    event.content = encrypted
    event.tags = [['d', FAVORITES_D_TAG]]

    await event.publish()
  },

  addFavorite: async (profile: SearchProfile) => {
    const { favorites, saveFavorites, isFavorite } = get()

    if (isFavorite(profile.pubkey)) {
      return
    }

    const favoriteProfile: FavoriteProfile = {
      pubkey: profile.pubkey,
      npub: profile.npub,
      name: profile.name,
      displayName: profile.displayName,
      picture: profile.picture,
      nip05: profile.nip05,
    }

    set({ favorites: [...favorites, favoriteProfile] })

    try {
      await saveFavorites()
    } catch (error) {
      console.error('[FavoritesStore] Failed to save favorite:', error)
      // Revert on failure
      set({ favorites: favorites.filter((f) => f.pubkey !== profile.pubkey) })
      throw error
    }
  },

  removeFavorite: async (pubkey: string) => {
    const { favorites, saveFavorites } = get()
    const removedFavorite = favorites.find((f) => f.pubkey === pubkey)

    if (!removedFavorite) {
      return
    }

    set({ favorites: favorites.filter((f) => f.pubkey !== pubkey) })

    try {
      await saveFavorites()
    } catch (error) {
      console.error('[FavoritesStore] Failed to remove favorite:', error)
      // Revert on failure
      set({ favorites: [...favorites, removedFavorite] })
      throw error
    }
  },

  isFavorite: (pubkey: string) => {
    const { favorites } = get()
    return favorites.some((f) => f.pubkey === pubkey)
  },

  clearFavorites: () => {
    set({ favorites: [], isLoaded: false })
  },
}))
