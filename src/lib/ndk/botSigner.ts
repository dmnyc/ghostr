import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { createNSECSigner } from './signers'

let botSigner: NDKPrivateKeySigner | null = null
let botEnabled = false

/**
 * Initialize the bot signer from environment variable
 * Call this once during app initialization
 */
export function initializeBotSigner(): void {
  const botNsec = import.meta.env.VITE_BOT_NSEC

  if (!botNsec) {
    console.log('[BotSigner] No bot nsec configured - bot notifications disabled')
    botEnabled = false
    botSigner = null
    return
  }

  try {
    botSigner = createNSECSigner(botNsec)
    botEnabled = true
    console.log('[BotSigner] Bot signer initialized successfully')
  } catch (error) {
    console.error('[BotSigner] Failed to initialize bot signer:', error)
    botEnabled = false
    botSigner = null
  }
}

export function getBotSigner(): NDKPrivateKeySigner | null {
  return botEnabled ? botSigner : null
}

export function isBotEnabled(): boolean {
  return botEnabled
}

export async function getBotPubkey(): Promise<string | null> {
  if (!botSigner) return null
  try {
    const user = await botSigner.user()
    return user.pubkey
  } catch {
    return null
  }
}
