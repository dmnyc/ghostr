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
import { Switch } from '@/components/ui/switch'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSubmissionStore } from '@/stores/submissionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePublishHistoryStore } from '@/stores/publishHistoryStore'
import { sendGiftWrappedReceipt } from '@/lib/nostr/nip59'
import type { Submission } from '@/types/submission'
import type { ReceiptPayload } from '@/types/receipt'
import { toast } from '@/hooks/useToast'
import { PROTOCOL_VERSION } from '@/lib/constants'
import { sendBotNotification } from '@/lib/nostr/nip04'
import { createApprovalNotification } from '@/lib/notifications/messageTemplates'

interface PublishDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submission: Submission
  editedContent: string
  editedTitle?: string
  editedSummary?: string
  editedCoverImage?: string
  onSuccess: () => void
}

export function PublishDialog({
  open,
  onOpenChange,
  submission,
  editedContent,
  editedTitle,
  editedSummary,
  editedCoverImage,
  onSuccess,
}: PublishDialogProps) {
  const { ndk } = useNDKStore()
  const { signer } = useAuthStore()
  const { markAsApproved, isProcessed } = useSubmissionStore()
  const { creditGhostr } = useSettingsStore()
  const { addItem } = usePublishHistoryStore()

  const [isPublishing, setIsPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [includeCredit, setIncludeCredit] = useState(creditGhostr)

  const splitThreadPosts = (value: string) =>
    value.split(/\n\s*---\s*\n/g).map((post) => post.trim()).filter(Boolean)
  const hasThreadTag = submission.tags.some((tag) => tag[0] === 'ghostr-thread' && tag[1] === 'true')
  const payloadThreadPosts = submission.threadPosts?.map((post) => post.trim()).filter(Boolean) ?? []
  const contentThreadPosts = splitThreadPosts(editedContent)
  const isThreadSubmission = submission.kind === 1 && (hasThreadTag || payloadThreadPosts.length > 1 || contentThreadPosts.length > 1)
  const dialogThreadPosts = isThreadSubmission
    ? (contentThreadPosts.length > 1 ? contentThreadPosts : payloadThreadPosts)
    : []
  const overLimitCount = dialogThreadPosts.filter((post) => post.length > 280).length

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
      const isThread = isThreadSubmission
      const editedThreadPosts = isThread
        ? (editedContent.split(/\n\s*---\s*\n/g).map((post) => post.trim()).filter(Boolean).length > 1
          ? editedContent.split(/\n\s*---\s*\n/g).map((post) => post.trim()).filter(Boolean)
          : (submission.threadPosts?.map((post) => post.trim()).filter(Boolean) ?? []))
        : []

      if (isThread && submission.kind === 1) {
        if (editedThreadPosts.length < 2) {
          setError('Threads need at least two non-empty posts before publishing')
          setIsPublishing(false)
          return
        }
        const publishedIds: string[] = []
        let publisherPubkey: string | undefined
        for (const [index, postContent] of editedThreadPosts.entries()) {
          const threadEvent = new NDKEvent(ndk)
          threadEvent.kind = 1
          threadEvent.content = postContent
          const tags: string[][] = submission.tags.filter((t) => t[0] !== 'ghostr-thread')
          if (includeCredit) {
            tags.push(['client', 'Ghostr'])
          }
          if (index > 0) {
            const rootId = publishedIds[0]
            const replyId = publishedIds[publishedIds.length - 1]
            if (!rootId || !replyId) throw new Error('Missing thread root or reply event id')
            tags.push(['e', rootId, '', 'root'])
            tags.push(['e', replyId, '', 'reply'])
            if (publisherPubkey) {
              tags.push(['p', publisherPubkey])
            }
          }
          threadEvent.tags = tags
          await threadEvent.sign(signer)
          publisherPubkey = publisherPubkey || threadEvent.pubkey
          await threadEvent.publish()
          publishedIds.push(threadEvent.id)
        }

        const rootEventId = publishedIds[0]
        if (!rootEventId) throw new Error('No thread posts were published')
        try {
          const receipt: ReceiptPayload = {
            protocol: PROTOCOL_VERSION,
            type: 'receipt',
            submissionId: submission.id,
            action: 'approved',
            eventId: rootEventId,
            timestamp: Date.now(),
          }
          await sendGiftWrappedReceipt(submission.delegatePubkey, receipt)
        } catch (receiptError) {
          console.error('Failed to send receipt:', receiptError)
        }

        markAsApproved(submission.id, rootEventId)
        publishedIds.forEach((eventId, index) => {
          addItem({
            id: eventId,
            content: editedThreadPosts[index] || '',
            kind: 1,
            publishedAt: Date.now(),
            source: 'delegate',
            delegatePubkey: submission.delegatePubkey,
            delegateNpub: submission.delegateNpub,
          })
        })

        toast({
          title: 'Thread published successfully',
          description: `${publishedIds.length} posts have been published as a thread.`,
        })

        onOpenChange(false)
        onSuccess()
        return
      }

      // Normalize line breaks for markdown: convert single \n to \n\n for proper paragraph breaks
      const normalizedContent = editedContent.replace(/([^\n])\n([^\n])/g, '$1\n\n$2')

      // Create the event with admin's key
      const event = new NDKEvent(ndk)
      event.kind = submission.kind
      event.content = normalizedContent

      // Build tags based on kind
      const tags: string[][] = []
      let dTag: string | undefined

      if (submission.kind === 30023) {
        // Long-form article requires a 'd' tag
        dTag = `ghostr-${submission.id}`
        tags.push(['d', dTag])

        // Use edited title and summary if provided, otherwise fall back to original tags
        if (editedTitle?.trim()) {
          tags.push(['title', editedTitle])
        } else {
          const titleTag = submission.tags.find((t) => t[0] === 'title')
          if (titleTag) tags.push(titleTag)
        }

        if (editedSummary?.trim()) {
          tags.push(['summary', editedSummary])
        } else {
          const summaryTag = submission.tags.find((t) => t[0] === 'summary')
          if (summaryTag) tags.push(summaryTag)
        }

        // Add published_at timestamp
        tags.push(['published_at', Math.floor(Date.now() / 1000).toString()])

        // Add cover image if provided (edited or original)
        if (editedCoverImage?.trim()) {
          tags.push(['image', editedCoverImage])
        } else {
          const imageTag = submission.tags.find((t) => t[0] === 'image')
          if (imageTag) tags.push(imageTag)
        }

        // Add other tags except d, title, summary, image (already handled above)
        tags.push(...submission.tags.filter((t) => t[0] && !['d', 'title', 'summary', 'image'].includes(t[0])))
      } else {
        tags.push(...submission.tags)
      }

      // Add client tag if enabled
      if (includeCredit) {
        tags.push(['client', 'Ghostr'])
      }

      event.tags = tags

      // Sign and publish
      await event.sign(signer)
      await event.publish()

      const publishedEventId = event.id

      // Use edited values if provided, otherwise extract from original tags
      const finalTitle = editedTitle?.trim() || submission.tags.find((t) => t[0] === 'title')?.[1]
      const finalCoverImage = editedCoverImage?.trim() || submission.tags.find((t) => t[0] === 'image')?.[1]

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

        // Send bot notification (fire-and-forget)
        try {
          const notification = await createApprovalNotification({
            submissionId: submission.id,
            eventId: publishedEventId,
          })
          sendBotNotification(submission.delegatePubkey, notification)
        } catch (error) {
          console.error('[PublishDialog] Bot notification error (non-critical):', error)
        }
      } catch (receiptError) {
        console.error('Failed to send receipt:', receiptError)
        // Don't fail the whole operation if receipt fails
      }

      markAsApproved(submission.id, publishedEventId)

      // Add to publish history
      addItem({
        id: publishedEventId,
        content: normalizedContent,
        kind: submission.kind,
        title: finalTitle,
        dTag,
        coverImage: finalCoverImage,
        publishedAt: Date.now(),
        source: 'delegate',
        delegatePubkey: submission.delegatePubkey,
        delegateNpub: submission.delegateNpub,
      })

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
          <DialogTitle>{isThreadSubmission ? 'Publish Thread' : 'Publish Content'}</DialogTitle>
          <DialogDescription>
            {isThreadSubmission
              ? 'This will publish each thread post sequentially with root/reply tags, signed with your key.'
              : 'This will create a new event signed with your key and publish it to your relays.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-muted p-4 space-y-3">
            <h4 className="font-medium text-sm">Event Preview</h4>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Kind:</span>{' '}
                {isThreadSubmission ? `${dialogThreadPosts.length} thread posts` : submission.kind}
              </div>
              <div>
                <span className="text-muted-foreground">Content length:</span>{' '}
                {editedContent.length} characters
              </div>
              <div>
                <span className="text-muted-foreground">Tags:</span>{' '}
                {submission.tags.filter((tag) => tag[0] !== 'ghostr-thread').length} public tag(s)
              </div>
            </div>
            {isThreadSubmission && (
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {dialogThreadPosts.map((post, index) => (
                  <div key={index} className="rounded-md border bg-background p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between font-medium">
                      <span>Post {index + 1}</span>
                      <span className={post.length > 280 ? 'text-destructive' : 'text-muted-foreground'}>
                        {post.length}/280
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-muted-foreground line-clamp-3">{post}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              A receipt will be sent to the delegate notifying them that their
              submission has been approved and published.
            </p>
          </div>

          {isThreadSubmission && overLimitCount > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">
                {overLimitCount} post{overLimitCount === 1 ? '' : 's'} exceed 280 characters. They can still publish to Nostr, but may not fit X-style limits.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
            <Switch
              checked={includeCredit}
              onCheckedChange={setIncludeCredit}
            />
            Credit Ghostr
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handlePublish} disabled={isPublishing}>
              {isPublishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {isPublishing ? 'Publishing...' : isThreadSubmission ? `Publish ${dialogThreadPosts.length} posts` : 'Publish to Nostr'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
