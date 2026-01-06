import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Save, Send, Loader2, ExternalLink, X, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/common/StatusBadge'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { MentionTextarea } from '@/components/common/MentionTextarea'
import { ProfileSearchInput } from '@/components/common/ProfileSearchInput'
import { SubmitDialog } from './SubmitDialog'
import { useDraftStore } from '@/stores/draftStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { useUIStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'
import { useDebounce } from '@/hooks/useDebounce'
import { getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'
import type { DraftPublisher } from '@/types/draft'

interface DraftEditorProps {
  onBack: () => void
}

export function DraftEditor({ onBack }: DraftEditorProps) {
  const { currentDraftId, drafts, updateDraft, saveDrafts, isSaving } = useDraftStore()
  const { favorites, loadFavorites, isLoaded: favoritesLoaded, addFavorite, removeFavorite, isFavorite } = useFavoritesStore()
  const { isSubmitDialogOpen, setSubmitDialogOpen } = useUIStore()

  // Find draft by ID to avoid creating new object references
  const draft = drafts.find((d) => d.id === currentDraftId)

  const [title, setTitle] = useState(draft?.title ?? '')
  const [content, setContent] = useState(draft?.content ?? '')
  const [isLongForm, setIsLongForm] = useState(draft?.targetKind === 30023)
  const [hasChanges, setHasChanges] = useState(false)
  const [publisherSearch, setPublisherSearch] = useState('')
  const [selectedPublisher, setSelectedPublisher] = useState<DraftPublisher | null>(
    draft?.targetPublisher ?? null
  )

  // Track if initial mount to avoid auto-save on first render
  const isInitialMount = useRef(true)

  // Load favorites on mount
  useEffect(() => {
    if (!favoritesLoaded) {
      loadFavorites()
    }
  }, [favoritesLoaded, loadFavorites])

  // Auto-save with debounce
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
      })
    }
  }, [debouncedContent, debouncedTitle, isLongForm, selectedPublisher, currentDraftId, hasChanges, updateDraft])

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
    })

    await saveDrafts()
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
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
                disabled={isSubmittedOrPublished}
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

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
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
            <p className="text-xs text-muted-foreground">
              {content.length} characters
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
                <Label htmlFor="kind-toggle">Long-form Article</Label>
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

          {draft.submittedTo && (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium">Submission Info</h3>
              <p className="text-xs text-muted-foreground">
                Submitted to:
              </p>
              <p className="text-xs font-mono break-all">
                {draft.submittedTo}
              </p>
            </div>
          )}

          {draft.publishedEventId && (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium">Published</h3>
              <p className="text-xs text-muted-foreground">Event ID:</p>
              <p className="text-xs font-mono break-all">
                {draft.publishedEventId}
              </p>
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
