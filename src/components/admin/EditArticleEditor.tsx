import { useState } from 'react'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { CoverImageInput } from '@/components/common/CoverImageInput'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePublishHistoryStore, type PublishedItem } from '@/stores/publishHistoryStore'
import { toast } from '@/hooks/useToast'
import { NDKEvent } from '@nostr-dev-kit/ndk'

interface EditArticleEditorProps {
  item: PublishedItem
  onBack: () => void
  onPublished?: () => void
}

export function EditArticleEditor({ item, onBack, onPublished }: EditArticleEditorProps) {
  const { ndk } = useNDKStore()
  const { signer } = useAuthStore()
  const { creditGhostr } = useSettingsStore()
  const { updateItem } = usePublishHistoryStore()

  const [title, setTitle] = useState(item.title ?? '')
  const [content, setContent] = useState(item.content)
  const [coverImage, setCoverImage] = useState<string | undefined>(item.coverImage)
  const [isPublishing, setIsPublishing] = useState(false)
  const [includeCredit, setIncludeCredit] = useState(creditGhostr)

  const handlePublish = async () => {
    if (!content.trim()) {
      toast({
        title: 'Cannot publish',
        description: 'Please add some content before publishing.',
        variant: 'destructive',
      })
      return
    }

    if (!ndk || !signer) {
      toast({
        title: 'Not connected',
        description: 'Please ensure you are logged in and connected to relays.',
        variant: 'destructive',
      })
      return
    }

    if (!item.dTag) {
      toast({
        title: 'Cannot update',
        description: 'This article cannot be updated (missing identifier).',
        variant: 'destructive',
      })
      return
    }

    setIsPublishing(true)

    try {
      const event = new NDKEvent(ndk)
      event.kind = 30023
      event.content = content

      // Use the same d-tag to replace the article
      const tags: string[][] = [
        ['d', item.dTag],
        ['title', title],
        ['published_at', Math.floor(Date.now() / 1000).toString()],
      ]

      // Add cover image tag if set
      if (coverImage) {
        tags.push(['image', coverImage])
      }

      // Add client tag if enabled
      if (includeCredit) {
        tags.push(['client', 'Ghostr'])
      }

      event.tags = tags

      await event.sign(signer)
      await event.publish()

      // Update history entry
      updateItem(item.id, {
        id: event.id,
        content,
        kind: 30023,
        title,
        dTag: item.dTag,
        coverImage,
        publishedAt: Date.now(),
        source: item.source,
        delegatePubkey: item.delegatePubkey,
        delegateNpub: item.delegateNpub,
      })

      toast({
        title: 'Article updated!',
        description: 'Your article has been republished.',
      })

      onPublished?.()
      onBack()
    } catch (err) {
      console.error('Failed to publish:', err)
      toast({
        title: 'Failed to publish',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Edit Article</h1>
            <p className="text-sm text-muted-foreground">
              Update and republish this article
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={includeCredit}
              onChange={(e) => setIncludeCredit(e.target.checked)}
              className="rounded border-muted-foreground"
            />
            Credit Ghostr
          </label>
          <Button onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {isPublishing ? 'Publishing...' : 'Update Article'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px] items-start">
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter a title for your article"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <CoverImageInput
            value={coverImage}
            onChange={setCoverImage}
          />

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="Write your article here..."
            />
            <p className="text-xs text-muted-foreground">
              {content.length} characters
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="font-medium">Article Info</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Identifier:</span>
                <p className="font-mono text-xs break-all">{item.dTag}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Originally published:</span>
                <p>{new Date(item.publishedAt).toLocaleString()}</p>
              </div>
              {item.source === 'delegate' && (
                <div>
                  <span className="text-muted-foreground">Source:</span>
                  <p>From delegate</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Publishing will replace the existing article with the same identifier.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
