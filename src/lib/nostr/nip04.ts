import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk'
import { useNDKStore } from '@/stores/ndkStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { getBotSigner } from '@/lib/ndk/botSigner'
import { checkRateLimit } from '@/lib/notifications/rateLimit'

/**
 * Send a NIP-04 encrypted DM (kind 4) using the bot signer
 * Returns true if sent successfully, false otherwise
 */
export async function sendBotDM(
  recipientPubkey: string,
  message: string
): Promise<boolean> {
  const botSigner = getBotSigner()

  if (!botSigner) {
    console.log('[BotDM] Bot not configured, skipping notification')
    return false
  }

  const { ndk } = useNDKStore.getState()

  if (!ndk) {
    console.error('[BotDM] NDK not initialized')
    return false
  }

  try {
    const recipient = new NDKUser({ pubkey: recipientPubkey })

    // Encrypt the message using NIP-04 (required for kind 4 DMs)
    const encryptedContent = await botSigner.encrypt(recipient, message, 'nip04')

    // Create kind 4 event
    const dmEvent = new NDKEvent(ndk)
    dmEvent.kind = 4
    dmEvent.content = encryptedContent
    dmEvent.tags = [['p', recipientPubkey]]
    dmEvent.created_at = Math.floor(Date.now() / 1000)

    // Sign with bot signer
    await dmEvent.sign(botSigner)

    // Publish with timeout (don't block on slow relays)
    const publishPromise = dmEvent.publish()
    const timeoutPromise = new Promise<void>((resolve) =>
      setTimeout(resolve, 3000)
    )
    await Promise.race([publishPromise, timeoutPromise])

    console.log('[BotDM] Notification sent to', recipientPubkey.slice(0, 8))
    return true
  } catch (error) {
    console.error('[BotDM] Failed to send notification:', error)
    return false
  }
}

/**
 * Send notification with fire-and-forget pattern
 * Does not throw errors - failures are logged only
 */
export function sendBotNotification(
  recipientPubkey: string,
  message: string
): void {
  const { enableBotNotifications } = useSettingsStore.getState()

  if (!enableBotNotifications) {
    console.log('[BotDM] Bot notifications disabled in settings')
    return
  }

  if (!checkRateLimit(recipientPubkey)) {
    console.warn('[BotDM] Rate limit exceeded, notification dropped')
    return
  }

  sendBotDM(recipientPubkey, message).catch((error) => {
    console.error('[BotDM] Notification error (non-critical):', error)
  })
}
