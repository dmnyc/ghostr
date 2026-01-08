import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Save, Send, Loader2, ExternalLink, X, User, Check, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/common/StatusBadge'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { MentionTextarea } from '@/components/common/MentionTextarea'
import { ProfileSearchInput } from '@/components/common/ProfileSearchInput'
import { CoverImageInput } from '@/components/common/CoverImageInput'
import { ImageUploadButton } from '@/components/common/ImageUploadButton'
import { NotePreviewWithRemove } from '@/components/common/NotePreview'
import { SubmitDialog } from './SubmitDialog'
import { useDraftStore } from '@/stores/draftStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useUIStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'
import { useDebounce } from '@/hooks/useDebounce'
import { getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'
import type { DraftPublisher } from '@/types/draft'
import { extractImageUrls } from '@/lib/blossom'

interface DraftEditorProps {
  onBack: () => void
}

export function DraftEditor({ onBack }: DraftEditorProps) {
  const { currentDraftId, drafts, updateDraft, saveDraft, isSaving } = useDraftStore()
  const { favorites, loadFavorites, isLoaded: favoritesLoaded, addFavorite, removeFavorite, isFavorite } = useFavoritesStore()
  const { isSubmitDialogOpen, setSubmitDialogOpen } = useUIStore()

  // Find draft by ID to avoid creating new object references
  const draft = drafts.find((d) => d.id === currentDraftId)

  const [title, setTitle] = useState(draft?.title ?? '')
  const [content, setContent] = useState(draft?.content ?? '')
  const [isLongForm, setIsLongForm] = useState(draft?.targetKind === 30023)
  const [coverImage, setCoverImage] = useState<string | undefined>(draft?.coverImage)
  const [hasChanges, setHasChanges] = useState(false)
  const [publisherSearch, setPublisherSearch] = useState('')
  const [selectedPublisher, setSelectedPublisher] = useState<DraftPublisher | null>(
    draft?.targetPublisher ?? null
  )
  const [showPreview, setShowPreview] = useState(false)

  // Track if initial mount to avoid auto-save on first render
  const isInitialMount = useRef(true)

  // Image and mention handling for kind 1 notes
  const imageUrls = extractImageUrls(content)
  const hasImages = imageUrls.length > 0
  const hasMentions = /nostr:npub1[a-zA-Z0-9]{58}/.test(content)
  const hasPreviewContent = hasImages || hasMentions

  const handleImageUpload = (url: string) => {
    // Append image URL to content with newline
    setContent((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + url)
    setHasChanges(true)
  }

  const handleRemoveImage = (url: string) => {
    // Remove the image URL from content
    setContent((prev) => prev.replace(url, '').replace(/\n\n+/g, '\n\n').trim())
    setHasChanges(true)
  }

  // Load favorites on mount
  useEffect(() => {
    if (!favoritesLoaded) {
      loadFavorites()
    }
  }, [favoritesLoaded, loadFavorites])

  // Auto-save with debounce (saves to both store and relay)
  const debouncedContent = useDebounce(content, 1000)
  const debouncedTitle = useDebounce(title, 1000)

  useEffect(() => {
    // Skip the initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (currentDraftId && hasChanges) {
      updateDraft(currentDraftId, {
        title: debouncedTitle,
        content: debouncedContent,
        targetKind: isLongForm ? 30023 : 1,
        targetPublisher: selectedPublisher ?? undefined,
        coverImage: isLongForm ? coverImage : undefined,
      })
      // Also persist to relay (fire and forget)
      saveDraft(currentDraftId).catch(() => {
        // Silently fail - will retry on next change
      })
    }
  }, [debouncedContent, debouncedTitle, isLongForm, coverImage, selectedPublisher, currentDraftId, hasChanges, updateDraft, saveDraft])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    setHasChanges(true)
  }

  const handleContentChange = (value: string) => {
    setContent(value)
    setHasChanges(true)
  }

  const handleKindChange = (checked: boolean) => {
    setIsLongForm(checked)
    setHasChanges(true)
  }

  const handleCoverImageChange = (url: string | undefined) => {
    setCoverImage(url)
    setHasChanges(true)
  }

  const handlePublisherSelect = (profile: SearchProfile) => {
    const publisher: DraftPublisher = {
      pubkey: profile.pubkey,
      npub: profile.npub,
      name: profile.name,
      displayName: profile.displayName,
      picture: profile.picture,
      nip05: profile.nip05,
    }
    setSelectedPublisher(publisher)
    setPublisherSearch('')
    setHasChanges(true)
  }

  const handleClearPublisher = () => {
    setSelectedPublisher(null)
    setPublisherSearch('')
    setHasChanges(true)
  }

  const handleToggleFavorite = async (profile: SearchProfile) => {
    try {
      if (isFavorite(profile.pubkey)) {
        await removeFavorite(profile.pubkey)
        toast({
          title: 'Removed from favorites',
          description: `${getDisplayName(profile)} removed from favorites`,
        })
      } else {
        await addFavorite(profile)
        toast({
          title: 'Added to favorites',
          description: `${getDisplayName(profile)} added to favorites`,
        })
      }
    } catch (err) {
      console.error('Failed to update favorites:', err)
    }
  }

  const handleSave = async () => {
    if (!draft) return

    updateDraft(draft.id, {
      title,
      content,
      targetKind: isLongForm ? 30023 : 1,
      targetPublisher: selectedPublisher ?? undefined,
      coverImage: isLongForm ? coverImage : undefined,
    })

    await saveDraft(draft.id)
    setHasChanges(false)
    toast({
      title: 'Draft saved',
      description: 'Your draft has been saved to your Nostr relays.',
    })
  }

  const handleSubmitForReview = () => {
    if (!content.trim()) {
      toast({
        title: 'Cannot submit',
        description: 'Please add some content before submitting.',
        variant: 'destructive',
      })
      return
    }
    setSubmitDialogOpen(true)
  }

  const handleDismissRejection = async () => {
    if (!draft) return
    updateDraft(draft.id, { rejectionReason: undefined })
    await saveDraft(draft.id)
  }

  const handleBack = async () => {
    // Save before going back if there are changes
    if (draft && hasChanges) {
      updateDraft(draft.id, {
        title,
        content,
        targetKind: isLongForm ? 30023 : 1,
        targetPublisher: selectedPublisher ?? undefined,
        coverImage: isLongForm ? coverImage : undefined,
      })
      await saveDraft(draft.id).catch(() => {
        // Silently fail
      })
    }
    onBack()
  }

  if (!draft) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Draft not found</p>
        <Button onClick={onBack} variant="link">
          Go back
        </Button>
      </div>
    )
  }

  const isSubmittedOrPublished = draft.status === 'submitted' || draft.status === 'published'
  const isPublished = draft.status === 'published'

  return (
    <div className="space-y-6">
      {/* Rejection reason banner */}
      {draft.rejectionReason && (
        <div className="rounded-lg border-l-4 border-destructive bg-destructive/10 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Submission Rejected
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {draft.rejectionReason}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleDismissRejection}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {isPublished ? 'View Published Post' : 'Edit Draft'}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={draft.status} />
              {hasChanges && !isPublished && (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPublished && draft.publishedEventId ? (
            <Button
              variant="outline"
              onClick={() => window.open(`https://njump.me/${draft.publishedEventId}`, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Nostr
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isSaving || isSubmittedOrPublished}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
              <Button
                onClick={handleSubmitForReview}
                disabled={isSubmittedOrPublished || !selectedPublisher}
                title={!selectedPublisher ? 'Select a publisher first' : undefined}
              >
                <Send className="mr-2 h-4 w-4" />
                Submit for Review
              </Button>
            </>
          )}
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
                onChange={handleTitleChange}
                disabled={isSubmittedOrPublished}
              />
            </div>
          )}

          {isLongForm && (
            <CoverImageInput
              value={coverImage}
              onChange={handleCoverImageChange}
              disabled={isSubmittedOrPublished}
            />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Content</Label>
              {!isLongForm && !isSubmittedOrPublished && (
                <div className="flex items-center gap-2">
                  <ImageUploadButton onUpload={handleImageUpload} />
                  {hasPreviewContent && (
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
                onChange={(val) => {
                  setContent(val)
                  setHasChanges(true)
                }}
                placeholder="Write your article here..."
                disabled={isSubmittedOrPublished}
              />
            ) : (
              <MentionTextarea
                value={content}
                onChange={handleContentChange}
                placeholder="What do you want to say? Use @ to mention someone..."
                disabled={isSubmittedOrPublished}
                minHeight="200px"
              />
            )}
            {!isLongForm && showPreview && hasPreviewContent && (
              <NotePreviewWithRemove
                content={content}
                onRemoveImage={isSubmittedOrPublished ? () => {} : handleRemoveImage}
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
          {/* Publisher Selection */}
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium">Publisher</h3>
            {selectedPublisher ? (
              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                {selectedPublisher.picture ? (
                  <img
                    src={selectedPublisher.picture}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {selectedPublisher.displayName || selectedPublisher.name || formatNpub(selectedPublisher.pubkey)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selectedPublisher.nip05 || formatNpub(selectedPublisher.pubkey)}
                  </div>
                </div>
                {!isSubmittedOrPublished && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={handleClearPublisher}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Quick select favorites */}
                {favorites.length > 0 && !isSubmittedOrPublished && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground font-medium">Favorites</div>
                    {favorites.map((fav) => (
                      <div
                        key={fav.pubkey}
                        className="flex items-center gap-1"
                      >
                        <button
                          type="button"
                          onClick={() => handlePublisherSelect({
                            pubkey: fav.pubkey,
                            npub: fav.npub,
                            name: fav.name,
                            displayName: fav.displayName,
                            picture: fav.picture,
                            nip05: fav.nip05,
                          })}
                          className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm text-left min-w-0"
                        >
                          {fav.picture ? (
                            <img
                              src={fav.picture}
                              alt=""
                              className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                              <User className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <span className="truncate">
                            {fav.displayName || fav.name || formatNpub(fav.pubkey)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFavorite(fav.pubkey)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                          title="Remove from favorites"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <ProfileSearchInput
                  value={publisherSearch}
                  onChange={setPublisherSearch}
                  onSelect={handlePublisherSelect}
                  placeholder="Search publisher..."
                  disabled={isSubmittedOrPublished}
                  favorites={favorites.map((f) => ({
                    pubkey: f.pubkey,
                    npub: f.npub,
                    name: f.name,
                    displayName: f.displayName,
                    picture: f.picture,
                    nip05: f.nip05,
                  }))}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={isFavorite}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Choose who will publish this content
            </p>
          </div>

          {/* Post Type */}
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
                onCheckedChange={handleKindChange}
                disabled={isSubmittedOrPublished}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {isLongForm
                ? 'Long-form articles (NIP-23) support markdown and are best for blog posts and articles.'
                : 'Short notes (Kind 1) are like tweets - brief updates and thoughts.'}
            </p>
          </div>

          {draft.status === 'submitted' && !draft.publishedEventId && (
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                <Check className="h-4 w-4" />
                <span className="font-medium">Submitted</span>
              </div>
            </div>
          )}

          {draft.publishedEventId && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                <Check className="h-4 w-4" />
                <span className="font-medium">Published</span>
              </div>
              <a
                href={`https://njump.me/${draft.publishedEventId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-mono break-all bg-muted/30 p-2 rounded hover:bg-muted transition-colors"
              >
                <span className="truncate">{draft.publishedEventId}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>
            </div>
          )}
        </div>
      </div>

      <SubmitDialog
        open={isSubmitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        draft={draft}
      />
    </div>
  )
}
