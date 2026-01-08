import { create } from 'zustand'
import type { NDKSigner, NDKUser } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'
import { useNDKStore } from './ndkStore'
import { useDraftStore } from './draftStore'
import { useSubmissionStore } from './submissionStore'
import { createNIP07Signer, createNSECSigner } from '@/lib/ndk/signers'

type SignerType = 'nip07' | 'nsec' | null

interface UserProfile {
  name?: string
  picture?: string
  nip05?: string
  about?: string
}

interface AuthStore {
  isAuthenticated: boolean
  user: NDKUser | null
  signer: NDKSigner | null
  signerType: SignerType
  profile: UserProfile | null
  isLoading: boolean
  error: string | null

  loginWithNIP07: () => Promise<void>
  loginWithNSEC: (nsec: string) => Promise<void>
  logout: () => void
  fetchProfile: () => Promise<void>
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  user: null,
  signer: null,
  signerType: null,
  profile: null,
  isLoading: false,
  error: null,

  loginWithNIP07: async () => {
    set({ isLoading: true, error: null })

    try {
      const signer = await createNIP07Signer()
      const user = await signer.user()

      const { ndk } = useNDKStore.getState()
      if (ndk) {
        ndk.signer = signer
      }

      set({
        isAuthenticated: true,
        user,
        signer,
        signerType: 'nip07',
        isLoading: false,
      })

      // Save session type
      localStorage.setItem('ghostr-auth-type', 'nip07')

      // Fetch profile and NIP-65 relays in background (don't block login)
      get().fetchProfile().catch(() => {})
      useNDKStore.getState().fetchNIP65Relays(user.pubkey).catch(() => {})
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to login with NIP-07',
      })
    }
  },

  loginWithNSEC: async (nsec: string) => {
    set({ isLoading: true, error: null })

    try {
      const signer = createNSECSigner(nsec)
      const user = await signer.user()

      const { ndk } = useNDKStore.getState()
      if (ndk) {
        ndk.signer = signer
      }

      set({
        isAuthenticated: true,
        user,
        signer,
        signerType: 'nsec',
        isLoading: false,
      })

      // Fetch profile and NIP-65 relays in background (don't block login)
      get().fetchProfile().catch(() => {})
      useNDKStore.getState().fetchNIP65Relays(user.pubkey).catch(() => {})
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Invalid nsec',
      })
    }
  },

  logout: () => {
    const { ndk } = useNDKStore.getState()
    if (ndk) {
      ndk.signer = undefined
    }

    // Clear saved session and role
    localStorage.removeItem('ghostr-auth-type')
    sessionStorage.removeItem('ghostr-active-role')

    // Clear user-specific stores
    useDraftStore.getState().clearDrafts()
    useSubmissionStore.getState().setSubmissions([])

    set({
      isAuthenticated: false,
      user: null,
      signer: null,
      signerType: null,
      profile: null,
      error: null,
    })
  },

  restoreSession: async () => {
    const savedAuthType = localStorage.getItem('ghostr-auth-type')

    if (!savedAuthType) {
      return
    }

    // Only restore NIP-07 sessions (NSEC should not be persisted for security)
    if (savedAuthType === 'nip07') {
      try {
        await get().loginWithNIP07()
      } catch {
        // Clear invalid session
        localStorage.removeItem('ghostr-auth-type')
      }
    }
  },

  fetchProfile: async () => {
    const { user } = get()
    const { ndk } = useNDKStore.getState()

    if (!user || !ndk) return

    try {
      // Get user through NDK so it can fetch from relays
      const ndkUser = ndk.getUser({ pubkey: user.pubkey })
      await ndkUser.fetchProfile()

      if (ndkUser.profile) {
        set({
          profile: {
            name: ndkUser.profile.name || ndkUser.profile.displayName,
            picture: ndkUser.profile.picture || ndkUser.profile.image,
            nip05: ndkUser.profile.nip05,
            about: ndkUser.profile.about,
          },
        })
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    }
  },
}))

// Helper to get npub from pubkey
export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey)
}

// Helper to get pubkey from npub
export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub)
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub')
  }
  return decoded.data
}
