import { useState } from 'react'
import { X, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useSubmissionStore } from '@/stores/submissionStore'
import { sendGiftWrappedReceipt } from '@/lib/nostr/nip59'
import type { Submission } from '@/types/submission'
import type { ReceiptPayload } from '@/types/receipt'
import { toast } from '@/hooks/useToast'
import { PROTOCOL_VERSION } from '@/lib/constants'

interface FeedbackDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submission: Submission
  onSuccess: () => void
}

export function FeedbackDialog({
  open,
  onOpenChange,
  submission,
  onSuccess,
}: FeedbackDialogProps) {
  const { markAsRejected } = useSubmissionStore()

  const [feedback, setFeedback] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReject = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      // Send rejection receipt to delegate
      const receipt: ReceiptPayload = {
        protocol: PROTOCOL_VERSION,
        type: 'receipt',
        submissionId: submission.id,
        action: 'rejected',
        feedback: feedback.trim() || undefined,
        timestamp: Date.now(),
      }

      await sendGiftWrappedReceipt(submission.delegatePubkey, receipt)

      markAsRejected(submission.id)

      toast({
        title: 'Submission rejected',
        description: 'Feedback has been sent to the delegate.',
      })

      onOpenChange(false)
      setFeedback('')
      onSuccess()
    } catch (err) {
      console.error('Failed to send rejection:', err)
      setError(err instanceof Error ? err.message : 'Failed to send rejection')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Submission</DialogTitle>
          <DialogDescription>
            Provide feedback to the delegate about why this submission is being rejected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="feedback">Feedback (optional)</Label>
            <Textarea
              id="feedback"
              placeholder="Please make the following changes..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground">
              This feedback will be sent to the delegate so they can revise and resubmit.
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
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <X className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? 'Sending...' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
