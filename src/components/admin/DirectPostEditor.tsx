import { useState } from 'react'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { MentionPillTextarea } from '@/components/common/MentionPillTextarea'
import { CoverImageInput } from '@/components/common/CoverImageInput'
import { ImageUploadButton } from '@/components/common/ImageUploadButton'
import { ImageThumbnailGrid } from '@/components/common/ImageThumbnailGrid'
import { LinkPreviewGrid } from '@/components/common/LinkPreviewGrid'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePublishHistoryStore } from '@/stores/publishHistoryStore'
import { toast } from '@/hooks/useToast'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { extractImageUrls } from '@/lib/blossom'
import { extractLinkUrls, fetchLinkMetadata, type LinkMetadata } from '@/lib/urlUtils'

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
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [isLongForm, setIsLongForm] = useState(false)
  const [coverImage, setCoverImage] = useState<string | undefined>()
  const [isPublishing, setIsPublishing] = useState(false)
  const [includeCredit, setIncludeCredit] = useState(creditGhostr)
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [attachedLinks, setAttachedLinks] = useState<LinkMetadata[]>([])

  const imageUrls = extractImageUrls(content)
  const hasImages = imageUrls.length > 0 || attachedImages.length > 0

  const handleImageUpload = (url: string) => {
    if (isLongForm) {
      // For long-form articles, keep the old behavior (append to content)
      setContent((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + url)
    } else {
      // For kind 1 notes, add to separate state array
      setAttachedImages((prev) => [...prev, url])
    }
  }

  const handleRemoveImage = (url: string) => {
    if (isLongForm) {
      // For long-form articles, remove from content
      setContent((prev) => prev.replace(url, '').replace(/\n\n+/g, '\n\n').trim())
    } else {
      // For kind 1 notes, remove from state array
      setAttachedImages((prev) => prev.filter((u) => u !== url))
    }
  }

  const handleRemoveLink = (url: string) => {
    setAttachedLinks((prev) => prev.filter((l) => l.url !== url))
  }

  const handleContentChange = (value: string) => {
    setContent(value)

    // Only detect links for kind 1 notes
    if (!isLongForm) {
      // Detect new link URLs pasted/typed
      const linkUrls = extractLinkUrls(value)
      const existingUrls = attachedLinks.map(l => l.url)
      const newUrls = linkUrls.filter(url => !existingUrls.includes(url))

      // Fetch metadata for new URLs
      newUrls.forEach(async (url) => {
        setAttachedLinks(prev => [...prev, { url, loading: true }])
        const metadata = await fetchLinkMetadata(url)
        setAttachedLinks(prev =>
          prev.map(l => l.url === url ? metadata : l)
        )
      })

      // Remove links that were deleted from content
      const removedUrls = existingUrls.filter(url => !linkUrls.includes(url))
      if (removedUrls.length > 0) {
        setAttachedLinks(prev => prev.filter(l => !removedUrls.includes(l.url)))
      }
    }
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

      // For kind 1 notes, append attached images and links at the end
      let finalContent = content.trim()

      if (!isLongForm) {
        if (attachedImages.length > 0) {
          finalContent += '\n\n' + attachedImages.join('\n')
        }
        if (attachedLinks.length > 0) {
          finalContent += '\n\n' + attachedLinks.map(l => l.url).join('\n')
        }
      }

      event.content = finalContent

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

        // Add summary tag if set (NIP-23)
        if (summary.trim()) {
          tags.push(['summary', summary])
        }

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
        content: finalContent,
        kind: isLongForm ? 30023 : 1,
        title: isLongForm ? title : undefined,
        summary: isLongForm && summary.trim() ? summary : undefined,
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
      setSummary('')
      setContent('')
      setCoverImage(undefined)
      setAttachedImages([])
      setAttachedLinks([])

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">New Post</h1>
            <p className="text-sm text-muted-foreground">
              Publish directly to Nostr
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end sm:self-auto">
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
            <div className="space-y-2">
              <Label htmlFor="summary">Summary (optional)</Label>
              <Input
                id="summary"
                placeholder="Brief description of your article (recommended for discovery)"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                {summary.length}/200 characters - Helps readers discover your article
              </p>
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
              {!isLongForm && <ImageUploadButton onUpload={handleImageUpload} />}
            </div>
            {isLongForm ? (
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Write your article here..."
              />
            ) : (
              <>
                <MentionPillTextarea
                  value={content}
                  onChange={handleContentChange}
                  placeholder="What do you want to say? Type @ to mention someone..."
                  minHeight="200px"
                />
                {/* Show thumbnail grid for kind 1 notes */}
                <ImageThumbnailGrid
                  images={attachedImages}
                  onRemove={handleRemoveImage}
                  disabled={isPublishing}
                />
                {/* Show link previews for kind 1 notes */}
                <LinkPreviewGrid
                  links={attachedLinks}
                  onRemove={handleRemoveLink}
                  disabled={isPublishing}
                />
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {content.length} characters
              {hasImages && !isLongForm && ` | ${attachedImages.length} image${attachedImages.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="font-medium">Post Type</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="kind-toggle">
                  {isLongForm ? 'Long-form Article' : 'Short Note'}
                </Label>
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
