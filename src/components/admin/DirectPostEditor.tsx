import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Send, Loader2, Save, Trash2, RefreshCw, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { MentionPillTextarea } from '@/components/common/MentionPillTextarea'
import { CoverImageInput } from '@/components/common/CoverImageInput'
import { ImageUploadButton } from '@/components/common/ImageUploadButton'
import { ImageThumbnailGrid } from '@/components/common/ImageThumbnailGrid'
import { LinkPreviewGrid } from '@/components/common/LinkPreviewGrid'
import { ShortNoteLengthWarning } from '@/components/common/ShortNoteLengthWarning'
import { Switch } from '@/components/ui/switch'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePublishHistoryStore } from '@/stores/publishHistoryStore'
import { usePublisherDraftStore } from '@/stores/publisherDraftStore'
import { savePublisherDraftNIP37 } from '@/lib/nostr/nip37'
import { toast } from '@/hooks/useToast'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { extractImageUrls } from '@/lib/blossom'
import { extractLinkUrls, fetchLinkMetadata, type LinkMetadata } from '@/lib/urlUtils'
import { cn } from '@/lib/utils/cn'
import { hasThreadMarker, joinThreadPosts, splitThreadPosts } from '@/lib/threadUtils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DirectPostEditorProps {
  onBack: () => void
  onPublished?: () => void
}

export function DirectPostEditor({ onBack, onPublished }: DirectPostEditorProps) {
  const { ndk } = useNDKStore()
  const { signer } = useAuthStore()
  const { creditGhostr } = useSettingsStore()
  const { addItem } = usePublishHistoryStore()
  const { currentDraftId, drafts, updateDraft, createDraft, setCurrentDraft, deleteDraft } = usePublisherDraftStore()

  const currentDraft = drafts.find((d) => d.id === currentDraftId)

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [isLongForm, setIsLongForm] = useState(false)
  const [lengthWarningDismissed, setLengthWarningDismissed] = useState(false)
  const [isThread, setIsThread] = useState(false)
  const [threadPosts, setThreadPosts] = useState<string[]>([''])
  const [coverImage, setCoverImage] = useState<string | undefined>()
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishingPostIndex, setPublishingPostIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [includeCredit, setIncludeCredit] = useState(creditGhostr)
  const [attachedImages, setAttachedImages] = useState<string[]>([])
  const [attachedLinks, setAttachedLinks] = useState<LinkMetadata[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [lastRelaySave, setLastRelaySave] = useState<number | null>(null)

  const imageUrls = extractImageUrls(content)
  const hasImages = imageUrls.length > 0 || attachedImages.length > 0

  // Track whether we started in direct post mode (no draft loaded initially)
  const isDirectPostMode = useRef(!currentDraftId)
  // Track which draft has been initialized to prevent re-initialization
  const initializedDraftId = useRef<string | null>(null)
  // Auto-save timeout ref
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  // Track if initial mount to avoid setting hasChanges on first render
  const isInitialMount = useRef(true)

  // Initialize form when currentDraftId changes
  useEffect(() => {
    if (!currentDraft || !currentDraftId) {
      // No draft selected - allow creating new post
      return
    }

    // Only initialize if this is a different draft than last time
    if (initializedDraftId.current === currentDraftId) {
      return  // Already initialized this draft
    }

    // Mark this draft as initialized
    initializedDraftId.current = currentDraftId
    // We're now editing a draft, not in direct post mode
    isDirectPostMode.current = false

    // Load draft content into form
    setTitle(currentDraft.title)
    setContent(currentDraft.content)
    setIsLongForm(currentDraft.targetKind === 30023)
    const savedAsThread = currentDraft.targetKind === 1 && hasThreadMarker(currentDraft.tags)
    const savedThreadPosts = savedAsThread ? splitThreadPosts(currentDraft.content) : []
    setIsThread(savedAsThread)
    setThreadPosts(savedThreadPosts.length > 0 ? savedThreadPosts : [''])
    setCoverImage(currentDraft.coverImage)
    setAttachedImages(currentDraft.uploadedImages || [])
    setHasChanges(false)
    setLastRelaySave(currentDraft.updatedAt)

    // Parse link attachments from tags if present
    const linkMetadata: LinkMetadata[] = []
    for (const tag of currentDraft.tags) {
      if (tag[0] === 'r' && tag[1]) {
        // 'r' tag is used for link previews in kind 1 notes
        linkMetadata.push({ url: tag[1] })
      }
    }
    setAttachedLinks(linkMetadata)
  }, [currentDraftId, currentDraft])

  // Auto-save draft on content change (1s debounce)
  useEffect(() => {
    if (!currentDraftId || !currentDraft) {
      // No draft selected - don't auto-save
      return
    }

    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    // Mark as having changes
    setHasChanges(true)

    clearTimeout(autoSaveTimeoutRef.current)
    autoSaveTimeoutRef.current = setTimeout(() => {
      // Prepare tags
      const tags: string[][] = []

      // Add link preview tags for kind 1 notes
      if (!isLongForm) {
        attachedLinks.forEach((link) => {
          tags.push(['r', link.url])
        })
        if (isThread) {
          tags.push(['ghostr-thread', 'true'])
        }
      }

      updateDraft(currentDraftId, {
        title,
        content: !isLongForm && isThread ? threadContent() : content,
        targetKind: isLongForm ? 30023 : 1,
        tags,
        coverImage,
        uploadedImages: attachedImages,
      })
    }, 1000)

    return () => clearTimeout(autoSaveTimeoutRef.current)
  }, [title, content, isLongForm, isThread, threadPosts, coverImage, attachedImages, attachedLinks, currentDraftId, currentDraft, updateDraft])

  const threadContent = (posts: string[] = threadPosts) => joinThreadPosts(posts)

  const updateThreadPost = (index: number, value: string) => {
    setThreadPosts((prev) => prev.map((post, i) => (i === index ? value : post)))
  }

  const addThreadPost = () => setThreadPosts((prev) => [...prev, ''])

  const removeThreadPost = (index: number) => {
    setThreadPosts((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  const enableThreadMode = () => {
    setThreadPosts(content.trim() ? [content] : [''])
    setIsThread(true)
    setIsLongForm(false)
  }

  const disableThreadMode = () => {
    setContent(threadContent())
    setIsThread(false)
  }

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

  const handleSave = async () => {
    if (!currentDraft) return

    setIsSaving(true)

    try {
      // Prepare tags
      const tags: string[][] = []
      if (!isLongForm) {
        attachedLinks.forEach((link) => {
          tags.push(['r', link.url])
        })
        if (isThread) {
          tags.push(['ghostr-thread', 'true'])
        }
      }

      // Update local state
      updateDraft(currentDraft.id, {
        title,
        content: !isLongForm && isThread ? threadContent() : content,
        targetKind: isLongForm ? 30023 : 1,
        tags,
        coverImage,
        uploadedImages: attachedImages,
      })

      // Save to relay immediately
      await savePublisherDraftNIP37(currentDraft)

      setHasChanges(false)
      setLastRelaySave(Date.now())
      toast({
        title: 'Draft saved',
        description: 'Your draft has been saved to your Nostr relays.',
      })
    } catch (error) {
      console.error('Failed to save draft:', error)
      toast({
        title: 'Failed to save',
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!currentDraftId) return
    setShowDeleteDialog(false)
    await deleteDraft(currentDraftId)
    toast({
      title: 'Draft deleted',
      description: 'Your draft has been permanently deleted.',
    })
    onBack()
  }

  const handleBack = async () => {
    // Save before going back if there are changes
    if (currentDraft && hasChanges) {
      const tags: string[][] = []
      if (!isLongForm) {
        attachedLinks.forEach((link) => {
          tags.push(['r', link.url])
        })
        if (isThread) {
          tags.push(['ghostr-thread', 'true'])
        }
      }

      updateDraft(currentDraft.id, {
        title,
        content: !isLongForm && isThread ? threadContent() : content,
        targetKind: isLongForm ? 30023 : 1,
        tags,
        coverImage,
        uploadedImages: attachedImages,
      })

      // Try to save to relay but don't block on failure
      try {
        await savePublisherDraftNIP37(currentDraft)
      } catch {
        // Silently fail
      }
    }
    onBack()
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
    setPublishingPostIndex(null)
    let threadPublishedIds: string[] = []
    let threadPostCount = 0

    try {
      const cleanThreadPosts = isThread && !isLongForm
        ? threadPosts.map((post) => post.trim()).filter(Boolean)
        : []
      threadPostCount = cleanThreadPosts.length

      if (!isLongForm && isThread) {
        if (cleanThreadPosts.length < 2) {
          toast({
            title: 'Cannot publish thread',
            description: 'Add at least two non-empty posts before publishing a thread.',
            variant: 'destructive',
          })
          return
        }

        const publishedIds: string[] = []
        threadPublishedIds = publishedIds
        let publisherPubkey: string | undefined
        for (const [index, postContent] of cleanThreadPosts.entries()) {
          setPublishingPostIndex(index)
          let postFinalContent = postContent
          if (index === cleanThreadPosts.length - 1 && attachedImages.length > 0) {
            const newImages = attachedImages.filter(url => !postFinalContent.includes(url))
            if (newImages.length > 0) {
              postFinalContent += '\n\n' + newImages.join('\n')
            }
          }

          const threadEvent = new NDKEvent(ndk)
          threadEvent.kind = 1
          threadEvent.content = postFinalContent
          const tags: string[][] = []
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

          addItem({
            id: threadEvent.id,
            content: postFinalContent,
            kind: 1,
            publishedAt: Date.now(),
            source: 'direct',
          })
        }

        toast({
          title: 'Thread published!',
          description: `${publishedIds.length} posts have been published as a thread.`,
        })

        if (currentDraftId) {
          updateDraft(currentDraftId, {
            status: 'published',
            publishedEventId: publishedIds[0],
          })
          setCurrentDraft(null)
        }

        setTitle('')
        setSummary('')
        setContent('')
        setThreadPosts([''])
        setIsThread(false)
        setCoverImage(undefined)
        setAttachedImages([])
        setAttachedLinks([])
        initializedDraftId.current = null

        onPublished?.()
        onBack()
        return
      }

      const event = new NDKEvent(ndk)
      event.kind = isLongForm ? 30023 : 1

      // For kind 1 notes, append attached images and links at the end
      let finalContent = content.trim()

      if (!isLongForm) {
        if (attachedImages.length > 0) {
          // Only append images not already in content
          const newImages = attachedImages.filter(url => !finalContent.includes(url))
          if (newImages.length > 0) {
            finalContent += '\n\n' + newImages.join('\n')
          }
        }
        // Don't append links - they're already in the content (auto-detected from typing)
      } else {
        // For long-form markdown, normalize line breaks: convert single \n to \n\n for proper paragraph breaks
        finalContent = finalContent.replace(/([^\n])\n([^\n])/g, '$1\n\n$2')
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

      // Update draft status if publishing from a draft
      if (currentDraftId) {
        updateDraft(currentDraftId, {
          status: 'published',
          publishedEventId: event.id,
        })
        setCurrentDraft(null)  // Clear current draft
      }

      // Reset form
      setTitle('')
      setSummary('')
      setContent('')
      setCoverImage(undefined)
      setAttachedImages([])
      setAttachedLinks([])
      initializedDraftId.current = null  // Reset initialization tracking

      onPublished?.()
      onBack()
    } catch (err) {
      console.error('Failed to publish:', err)
      const baseMessage = err instanceof Error ? err.message : 'An error occurred'
      const description = threadPostCount > 0 && threadPublishedIds.length > 0 && threadPublishedIds.length < threadPostCount
        ? `${threadPublishedIds.length} of ${threadPostCount} posts went live before the error — posts 1 through ${threadPublishedIds.length} are already published. ${baseMessage}`
        : baseMessage
      toast({
        title: 'Failed to publish',
        description,
        variant: 'destructive',
      })
    } finally {
      setIsPublishing(false)
      setPublishingPostIndex(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {currentDraftId ? 'Edit Draft' : 'New Post'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-sm text-muted-foreground">
                {currentDraftId ? 'Auto-saves every second' : 'Publish directly to Nostr'}
              </p>
              {hasChanges && currentDraftId && (
                <span className="text-xs text-muted-foreground">
                  • Unsaved changes
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          {currentDraftId && lastRelaySave && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Saved to relays</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px] items-start">
        <div className="space-y-4">
          {(currentDraftId || (content.trim() || title.trim())) && (
            <div className="flex items-center justify-end gap-2">
            {currentDraftId && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
                <Button variant="outline" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save
                </Button>
              </>
            )}
            {!currentDraftId && (content.trim() || title.trim()) && (
              <Button
                variant="outline"
                onClick={() => {
                  const draft = createDraft(isLongForm ? 30023 : 1)
                  initializedDraftId.current = draft.id
                  setHasChanges(false)
                  toast({
                    title: 'Draft saved',
                    description: 'Your work has been saved as a draft.',
                  })
                }}
                disabled={isPublishing}
              >
                <Save className="mr-2 h-4 w-4" />
                Save as Draft
              </Button>
            )}
            <Button
              className="flex-1 md:hidden"
              onClick={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isPublishing ? 'Publishing...' : isDirectPostMode.current ? 'Publish Now' : 'Publish'}
            </Button>
            </div>
          )}
          <div className="rounded-lg border velvet bg-card p-4 space-y-4">
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
              <Label htmlFor="content" className="font-display">Content</Label>
              {!isLongForm && <ImageUploadButton onUpload={handleImageUpload} />}
            </div>
            {!isLongForm && isThread ? (
              <div className="space-y-3">
                <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                  Publisher thread mode publishes each box as a sequential kind 1 reply. Paste text separated by lines containing only <code className="font-mono">---</code>, then split if needed.
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setThreadPosts(splitThreadPosts(content).length > 0 ? splitThreadPosts(content) : splitThreadPosts(threadContent()))}
                  >
                    Split on ---
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={addThreadPost}>
                    <Plus className="mr-2 h-4 w-4" /> Add post
                  </Button>
                </div>
                {threadPosts.map((post, index) => (
                  <div key={index} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <Label>Post {index + 1}</Label>
                      {threadPosts.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeThreadPost(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <MentionPillTextarea
                      value={post}
                      onChange={(value) => updateThreadPost(index, value)}
                      placeholder={`Thread post ${index + 1}`}
                      minHeight="120px"
                    />
                  </div>
                ))}
              </div>
            ) : isLongForm ? (
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
                <ShortNoteLengthWarning
                  content={content}
                  dismissed={lengthWarningDismissed}
                  onDismiss={() => setLengthWarningDismissed(true)}
                  onConvert={() => setIsLongForm(true)}
                />
              </>
            )}
            {hasImages && !isLongForm && (
              <p className="text-xs text-muted-foreground">
                {attachedImages.length} image{attachedImages.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        </div>

        <div className="space-y-4 md:sticky md:top-6">
          <Button className="hidden w-full md:flex" onClick={handlePublish} disabled={isPublishing}>
            {isPublishing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {isPublishing ? 'Publishing...' : isDirectPostMode.current ? 'Publish Now' : 'Publish'}
          </Button>
          <div className="rounded-lg border velvet bg-card p-4 space-y-4">
            <h3 className="font-medium">Post Type</h3>
            <div className="flex items-center bg-primary/15 rounded-full p-1">
              <button
                onClick={() => {
                  setIsLongForm(false)
                  setIsThread(false)
                }}
                className={cn(
                  'flex-1 px-3 py-2 rounded-full text-sm font-medium transition-colors',
                  !isLongForm
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Short Note
              </button>
              <button
                onClick={enableThreadMode}
                className={cn(
                  'flex-1 px-3 py-2 rounded-full text-sm font-medium transition-colors',
                  !isLongForm && isThread
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Thread
              </button>
              <button
                onClick={() => {
                  if (isThread) disableThreadMode()
                  setIsLongForm(true)
                }}
                className={cn(
                  'flex-1 px-3 py-2 rounded-full text-sm font-medium transition-colors',
                  isLongForm
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Long-form
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {!isLongForm && isThread
                ? 'Threads publish multiple kind 1 notes with root/reply tags.'
                : isLongForm
                ? 'Long-form articles (NIP-23, kind 30023) support markdown and are best for blog posts and articles.'
                : 'Short notes (kind 1) are like tweets - brief updates and thoughts.'}
            </p>
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  checked={includeCredit}
                  onCheckedChange={setIncludeCredit}
                />
                <span>Credit Ghostr</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Add "via Ghostr" tag to posted event
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this draft from both your local storage and relays.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
