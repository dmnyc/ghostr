import { useState } from 'react'
import { Check, Loader2, AlertCircle } from 'lucide-react'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSubmissionStore } from '@/stores/submissionStore'
import { sendGiftWrappedReceipt } from '@/lib/nostr/nip59'
import type { Submission } from '@/types/submission'
import type { ReceiptPayload } from '@/types/receipt'
import { toast } from '@/hooks/useToast'
import { PROTOCOL_VERSION } from '@/lib/constants'

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submission: Submission
  editedContent: string
  onSuccess: () => void
}

export function PublishDialog({
  open,
  onOpenChange,
  submission,
  editedContent,
  onSuccess,
}: PublishDialogProps) {
  const { ndk } = useNDKStore()
  const { signer } = useAuthStore()
  const { markAsApproved, isProcessed } = useSubmissionStore()

  const [isPublishing, setIsPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePublish = async () => {
    if (!ndk || !signer) {
      setError('Not connected or authenticated')
      return
    }

    // Idempotency check
    if (isProcessed(submission.id)) {
      setError('This submission has already been processed')
      return
    }

    setIsPublishing(true)
    setError(null)

    try {
      // Create the event with admin's key
      const event = new NDKEvent(ndk)
      event.kind = submission.kind
      event.content = editedContent

      // Add tags based on kind
      if (submission.kind === 30023) {
        // Long-form article requires a 'd' tag
        const dTag = `ghostr-${submission.id}`
        event.tags = [
          ['d', dTag],
          ...submission.tags.filter((t) => t[0] !== 'd'),
        ]
      } else {
        event.tags = submission.tags
      }

      // Sign and publish
      await event.sign(signer)
      await event.publish()

      const publishedEventId = event.id

      // Send receipt to delegate
      try {
        const receipt: ReceiptPayload = {
          protocol: PROTOCOL_VERSION,
          type: 'receipt',
          submissionId: submission.id,
          action: 'approved',
          eventId: publishedEventId,
          timestamp: Date.now(),
        }

        await sendGiftWrappedReceipt(submission.delegatePubkey, receipt)
      } catch (receiptError) {
        console.error('Failed to send receipt:', receiptError)
        // Don't fail the whole operation if receipt fails
      }

      markAsApproved(submission.id, publishedEventId)

      toast({
        title: 'Published successfully',
        description: 'The content has been published with your key.',
      })

      onOpenChange(false)
      onSuccess()
    } catch (err) {
      console.error('Failed to publish:', err)
      setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish Content</DialogTitle>
          <DialogDescription>
            This will create a new event signed with your key and publish it to your relays.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-muted p-4 space-y-2">
            <h4 className="font-medium text-sm">Event Preview</h4>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Kind:</span>{' '}
                {submission.kind}
              </div>
              <div>
                <span className="text-muted-foreground">Content length:</span>{' '}
                {editedContent.length} characters
              </div>
              <div>
                <span className="text-muted-foreground">Tags:</span>{' '}
                {submission.tags.length} tag(s)
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              A receipt will be sent to the delegate notifying them that their
              submission has been approved and published.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
