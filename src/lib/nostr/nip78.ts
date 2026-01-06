import { NDKEvent } from '@nostr-dev-kit/ndk'
import type { Draft } from '@/types/draft'
import { DRAFT_D_TAG, DRAFT_KIND } from '@/lib/constants'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'

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
