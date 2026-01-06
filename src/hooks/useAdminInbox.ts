import { useEffect, useRef } from 'react'
import type { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSubmissionStore } from '@/stores/submissionStore'
import { unwrapGiftWrappedMessage, submissionFromPayload } from '@/lib/nostr/nip59'
import type { SubmissionPayload } from '@/types/submission'

const GIFT_WRAP_KIND = 1059

export function useAdminInbox() {
  const { ndk } = useNDKStore()
  const { user, isAuthenticated } = useAuthStore()
  const { addSubmission, isProcessed, setLoading } = useSubmissionStore()
  const subscriptionRef = useRef<NDKSubscription | null>(null)

  useEffect(() => {
    if (!ndk || !user || !isAuthenticated) {
      return
    }

    const subscribe = async () => {
      setLoading(true)

      // Clean up existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.stop()
      }

      const filter = {
        kinds: [GIFT_WRAP_KIND],
        '#p': [user.pubkey],
        // Get messages from the last 30 days
        since: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
      }

      const sub = ndk.subscribe(filter, { closeOnEose: false })
      subscriptionRef.current = sub

      sub.on('event', async (event: NDKEvent) => {
        try {
          const unwrapped = await unwrapGiftWrappedMessage(event)

          if (!unwrapped) {
            return
          }

          // Check if it's a submission
          if (unwrapped.payload.type !== 'submission') {
            return
          }

          const payload = unwrapped.payload as SubmissionPayload

          // Check if already processed
          if (isProcessed(payload.id)) {
            return
          }

          const submission = submissionFromPayload(
            payload,
            unwrapped.senderPubkey,
            event.id
          )

          addSubmission(submission)
        } catch (error) {
          console.error('Failed to process gift wrap:', error)
        }
      })

      sub.on('eose', () => {
        setLoading(false)
      })
    }

    subscribe()

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.stop()
        subscriptionRef.current = null
      }
    }
  }, [ndk, user, isAuthenticated, addSubmission, isProcessed, setLoading])
}
