import { NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { nip19 } from 'nostr-tools'

export function hasNIP07Extension(): boolean {
  return typeof window !== 'undefined' && !!(window as Window & { nostr?: unknown }).nostr
}

export async function createNIP07Signer(): Promise<NDKNip07Signer> {
  if (!hasNIP07Extension()) {
    throw new Error('No NIP-07 extension detected. Please install Alby or nos2x.')
  }

  const signer = new NDKNip07Signer()
  await signer.blockUntilReady()
  return signer
}

export function createNSECSigner(nsec: string): NDKPrivateKeySigner {
  let privateKey: Uint8Array

  if (nsec.startsWith('nsec')) {
    const decoded = nip19.decode(nsec)
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec format')
    }
    privateKey = decoded.data
  } else {
    // Assume hex format
    privateKey = hexToBytes(nsec)
  }

  return new NDKPrivateKeySigner(privateKey)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
