import { useState } from 'react'
import { ArrowLeft, Send, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { CoverImageInput } from '@/components/common/CoverImageInput'
import { ImageUploadButton } from '@/components/common/ImageUploadButton'
import { NotePreviewWithRemove } from '@/components/common/NotePreview'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePublishHistoryStore } from '@/stores/publishHistoryStore'
import { toast } from '@/hooks/useToast'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { extractImageUrls } from '@/lib/blossom'

interface DirectPostEditorProps {
  onBack: () => void
  onPublished?: () => void
}

export function DirectPostEditor({ onBack, onPublished }: DirectPostEditorProps) {
  const { ndk } = useNDKStore()
  const { signer } = useAuthStore()
  const { creditGhostr } = useSettingsStore()
  const { addItem } = usePublishHistoryStore()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isLongForm, setIsLongForm] = useState(false)
  const [coverImage, setCoverImage] = useState<string | undefined>()
  const [isPublishing, setIsPublishing] = useState(false)
  const [includeCredit, setIncludeCredit] = useState(creditGhostr)
  const [showPreview, setShowPreview] = useState(false)

  const imageUrls = extractImageUrls(content)
  const hasImages = imageUrls.length > 0

  const handleImageUpload = (url: string) => {
    // Append image URL to content with newline
    setContent((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + url)
  }

  const handleRemoveImage = (url: string) => {
    // Remove the image URL from content
    setContent((prev) => prev.replace(url, '').replace(/\n\n+/g, '\n\n').trim())
  }

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

    setIsPublishing(true)

    try {
      const event = new NDKEvent(ndk)
      event.kind = isLongForm ? 30023 : 1
      event.content = content

      const tags: string[][] = []
      let dTag: string | undefined

      if (isLongForm) {
        // Add NIP-23 tags for long-form content
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')

        dTag = slug || `post-${Date.now()}`
        tags.push(
          ['d', dTag],
          ['title', title],
          ['published_at', Math.floor(Date.now() / 1000).toString()]
        )

        // Add cover image tag if set
        if (coverImage) {
          tags.push(['image', coverImage])
        }
      }

      // Add client tag if enabled
      if (includeCredit) {
        tags.push(['client', 'Ghostr'])
      }

      event.tags = tags

      await event.sign(signer)
      await event.publish()

      // Add to publish history
      addItem({
        id: event.id,
        content,
        kind: isLongForm ? 30023 : 1,
        title: isLongForm ? title : undefined,
        dTag: isLongForm ? dTag : undefined,
        coverImage: isLongForm ? coverImage : undefined,
        publishedAt: Date.now(),
        source: 'direct',
      })

      toast({
        title: 'Published!',
        description: 'Your post has been published to Nostr.',
      })

      // Reset form
      setTitle('')
      setContent('')
      setCoverImage(undefined)

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
            <h1 className="text-xl font-bold">New Post</h1>
            <p className="text-sm text-muted-foreground">
              Publish directly to Nostr
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
            {isPublishing ? 'Publishing...' : 'Publish'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px] items-start">
        <div className="rounded-lg border p-4 space-y-4">
          {isLongForm && (
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter a title for your article"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}

          {isLongForm && (
            <CoverImageInput
              value={coverImage}
              onChange={setCoverImage}
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Content</Label>
              {!isLongForm && (
                <div className="flex items-center gap-2">
                  <ImageUploadButton onUpload={handleImageUpload} />
                  {hasImages && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(!showPreview)}
                      className="gap-2"
                    >
                      {showPreview ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Hide Preview
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Preview
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
            {isLongForm ? (
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Write your article here..."
              />
            ) : (
              <Textarea
                id="content"
                placeholder="What do you want to say?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px]"
              />
            )}
            {!isLongForm && showPreview && hasImages && (
              <NotePreviewWithRemove
                content={content}
                onRemoveImage={handleRemoveImage}
                className="mt-2"
              />
            )}
            <p className="text-xs text-muted-foreground">
              {content.length} characters
              {hasImages && !isLongForm && ` | ${imageUrls.length} image${imageUrls.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="font-medium">Post Type</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="kind-toggle">Long-form Article</Label>
                <p className="text-xs text-muted-foreground">
                  Kind {isLongForm ? '30023' : '1'}
                </p>
              </div>
              <Switch
                id="kind-toggle"
                checked={isLongForm}
                onCheckedChange={setIsLongForm}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {isLongForm
                ? 'Long-form articles (NIP-23) support markdown and are best for blog posts and articles.'
                : 'Short notes (Kind 1) are like tweets - brief updates and thoughts.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
