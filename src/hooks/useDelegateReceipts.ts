import { useEffect, useRef } from 'react'
import type { NDKEvent, NDKSubscription } from '@nostr-dev-kit/ndk'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useDraftStore } from '@/stores/draftStore'
import { unwrapGiftWrappedMessage } from '@/lib/nostr/nip59'
import type { ReceiptPayload } from '@/types/receipt'
import { toast } from '@/hooks/useToast'

const GIFT_WRAP_KIND = 1059

export function useDelegateReceipts() {
  const { ndk } = useNDKStore()
  const { user, isAuthenticated } = useAuthStore()
  const { markAsPublished, markAsRejected, saveDrafts, drafts } = useDraftStore()
  const subscriptionRef = useRef<NDKSubscription | null>(null)

  useEffect(() => {
    if (!ndk || !user || !isAuthenticated) {
      return
    }

    const subscribe = async () => {
      // Clean up existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.stop()
      }

      const filter = {
        kinds: [GIFT_WRAP_KIND],
        '#p': [user.pubkey],
        // Get receipts from the last 30 days
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

          // Check if it's a receipt
          if (unwrapped.payload.type !== 'receipt') {
            return
          }

          const receipt = unwrapped.payload as ReceiptPayload

          // Find the corresponding draft
          const draft = drafts.find((d) => d.id === receipt.submissionId)

          if (!draft) {
            return
          }

          // Skip if already processed
          if (draft.status === 'published' && draft.publishedEventId) {
            return
          }

          if (receipt.action === 'approved' && receipt.eventId) {
            markAsPublished(receipt.submissionId, receipt.eventId)
            await saveDrafts()

            toast({
              title: 'Content Published!',
              description: 'Your submission has been approved and published by the admin.',
            })
          } else if (receipt.action === 'rejected') {
            // Skip if already processed
            if (draft.status === 'rejected') {
              return
            }

            markAsRejected(receipt.submissionId, receipt.feedback)
            await saveDrafts()

            toast({
              title: 'Submission Rejected',
              description: receipt.feedback || 'Your submission has been rejected by the publisher.',
              variant: 'destructive',
            })
          }
        } catch (error) {
          console.error('Failed to process receipt:', error)
        }
      })
    }

    subscribe()

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.stop()
        subscriptionRef.current = null
      }
    }
  }, [ndk, user, isAuthenticated, drafts, markAsPublished, markAsRejected, saveDrafts])
}
