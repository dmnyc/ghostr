import { useState } from 'react'
import { Send, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useDraftStore } from '@/stores/draftStore'
import { npubToPubkey } from '@/stores/authStore'
import { sendGiftWrappedSubmission } from '@/lib/nostr/nip59'
import type { SubmissionPayload } from '@/types/submission'
import type { Draft } from '@/types/draft'
import { toast } from '@/hooks/useToast'
import { PROTOCOL_VERSION } from '@/lib/constants'

interface SubmitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: Draft
}

export function SubmitDialog({ open, onOpenChange, draft }: SubmitDialogProps) {
  const { markAsSubmitted, saveDrafts } = useDraftStore()

  const [publisherNpub, setPublisherNpub] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)

    if (!publisherNpub.trim()) {
      setError('Please enter the publisher\'s npub')
      return
    }

    let publisherPubkey: string
    try {
      publisherPubkey = npubToPubkey(publisherNpub.trim())
    } catch {
      setError('Invalid npub format. It should start with "npub1"')
      return
    }

    setIsSubmitting(true)

    try {
      const payload: SubmissionPayload = {
        protocol: PROTOCOL_VERSION,
        type: 'submission',
        id: draft.id,
        content: draft.content,
        kind: draft.targetKind,
        tags: draft.tags,
        note: note.trim(),
      }

      await sendGiftWrappedSubmission(publisherPubkey, payload)

      markAsSubmitted(draft.id, publisherNpub.trim())
      await saveDrafts()

      toast({
        title: 'Submission sent',
        description: 'Your draft has been sent to the publisher for review.',
      })

      onOpenChange(false)
      setPublisherNpub('')
      setNote('')
    } catch (err) {
      console.error('Failed to submit:', err)
      setError(err instanceof Error ? err.message : 'Failed to send submission')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for Review</DialogTitle>
          <DialogDescription>
            Send this draft to a publisher for review and publishing.
            The content will be encrypted and only the publisher can read it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="publisher-npub">Publisher's npub</Label>
            <Input
              id="publisher-npub"
              placeholder="npub1..."
              value={publisherNpub}
              onChange={(e) => setPublisherNpub(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter the Nostr public key (npub) of the person who will review and publish this content.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note to Publisher (optional)</Label>
            <Textarea
              id="note"
              placeholder="Any notes for the reviewer..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px]"
            />
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
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? 'Sending...' : 'Send for Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
