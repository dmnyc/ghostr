import NDK from '@nostr-dev-kit/ndk'
import { getStoredRelays } from './relays'

let ndkInstance: NDK | null = null

export function getNDK(): NDK {
  if (!ndkInstance) {
    ndkInstance = new NDK({
      explicitRelayUrls: getStoredRelays(),
      autoConnectUserRelays: false,
    })
  }
  return ndkInstance
}

export async function initializeNDK(relays?: string[]): Promise<NDK> {
  const ndk = getNDK()

  if (relays) {
    for (const relay of relays) {
      ndk.addExplicitRelay(relay)
    }
  }

  // Connect with a timeout - don't wait forever for all relays
  const connectPromise = ndk.connect()
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(resolve, 3000) // 3 second timeout
  })

  await Promise.race([connectPromise, timeoutPromise])

  return ndk
}

export function resetNDK(): void {
  if (ndkInstance) {
    // Disconnect existing instance
    for (const relay of ndkInstance.pool.relays.values()) {
      relay.disconnect()
    }
  }
  ndkInstance = null
}
