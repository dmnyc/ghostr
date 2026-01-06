import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Save, Send, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { StatusBadge } from '@/components/common/StatusBadge'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { SubmitDialog } from './SubmitDialog'
import { useDraftStore } from '@/stores/draftStore'
import { useUIStore } from '@/stores/uiStore'
import { toast } from '@/hooks/useToast'
import { useDebounce } from '@/hooks/useDebounce'

interface DraftEditorProps {
  onBack: () => void
}

export function DraftEditor({ onBack }: DraftEditorProps) {
  const { currentDraftId, drafts, updateDraft, saveDrafts, isSaving } = useDraftStore()
  const { isSubmitDialogOpen, setSubmitDialogOpen } = useUIStore()

  // Find draft by ID to avoid creating new object references
  const draft = drafts.find((d) => d.id === currentDraftId)

  const [title, setTitle] = useState(draft?.title ?? '')
  const [content, setContent] = useState(draft?.content ?? '')
  const [isLongForm, setIsLongForm] = useState(draft?.targetKind === 30023)
  const [hasChanges, setHasChanges] = useState(false)

  // Track if initial mount to avoid auto-save on first render
  const isInitialMount = useRef(true)

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
      })
    }
  }, [debouncedContent, debouncedTitle, isLongForm, currentDraftId, hasChanges, updateDraft])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    setHasChanges(true)
  }

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setHasChanges(true)
  }

  const handleKindChange = (checked: boolean) => {
    setIsLongForm(checked)
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!draft) return

    updateDraft(draft.id, {
      title,
      content,
      targetKind: isLongForm ? 30023 : 1,
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

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
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
              <Textarea
                id="content"
                placeholder="What do you want to say?"
                value={content}
                onChange={handleContentChange}
                disabled={isSubmittedOrPublished}
                className="min-h-[200px]"
              />
            )}
            <p className="text-xs text-muted-foreground">
              {content.length} characters
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
