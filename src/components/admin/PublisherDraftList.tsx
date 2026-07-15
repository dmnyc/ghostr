import { FileText, Trash2, Archive, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingState } from '@/components/common/LoadingState'
import { usePublisherDraftStore } from '@/stores/publisherDraftStore'
import { savePublisherDraftNIP37 } from '@/lib/nostr/nip37'
import type { PublisherDraft } from '@/types/publisherDraft'
import { RichNotePreview } from '@/components/common/RichNotePreview'
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
import { toast } from '@/hooks/useToast'
import { useState } from 'react'

interface PublisherDraftCardProps {
  draft: PublisherDraft
  isArchived?: boolean
}

function PublisherDraftCard({ draft, isArchived = false }: PublisherDraftCardProps) {
  const { setCurrentDraft, deleteDraft, archiveDraft, updateDraft, drafts } = usePublisherDraftStore()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleEdit = () => {
    setCurrentDraft(draft.id)
  }

  const handleDelete = async () => {
    setShowDeleteDialog(false)
    await deleteDraft(draft.id)
    toast({
      title: 'Draft deleted',
      description: 'Your draft has been permanently deleted.',
    })
  }

  const handleArchive = async () => {
    if (window.confirm('Archive this draft? It will be hidden from your drafts list.')) {
      await archiveDraft(draft.id)
      toast({
        title: 'Draft archived',
        description: 'Your draft has been moved to the archive.',
      })
    }
  }

  const handleUnarchive = async () => {
    updateDraft(draft.id, { archived: false })

    // Sync to relay
    const updatedDraft = drafts.find((d) => d.id === draft.id)
    if (updatedDraft) {
      try {
        await savePublisherDraftNIP37({ ...updatedDraft, archived: false })
        toast({
          title: 'Draft restored',
          description: 'Your draft has been moved back to the drafts list.',
        })
      } catch (error) {
        console.error('[PublisherDraftList] Failed to sync restored draft:', error)
        toast({
          title: 'Restore failed',
          description: 'Failed to sync restore to relays, but the draft is restored locally.',
          variant: 'destructive',
        })
      }
    }
  }

  const formattedDate = new Date(draft.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Card className={`flex flex-col hover:shadow-md transition-shadow ${isArchived ? 'opacity-75' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium truncate">
              {draft.title || (draft.targetKind === 1 ? 'Short Note Draft' : 'Untitled Draft')}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Kind {draft.targetKind === 1 ? '1 (Note)' : '30023 (Article)'}</span>
          <span>•</span>
          <span>{formattedDate}</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {draft.content ? (
          <RichNotePreview content={draft.content} compact maxLength={100} className="text-sm text-muted-foreground" />
        ) : (
          <p className="text-sm text-muted-foreground">No content yet</p>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        {isArchived ? (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-2"
            onClick={handleUnarchive}
          >
            <RotateCcw className="h-4 w-4" />
            Restore
          </Button>
        ) : (
          <>
            <Button variant="default" size="sm" className="flex-1" onClick={handleEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              title="Delete draft"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleArchive} title="Archive draft">
              <Archive className="h-4 w-4" />
            </Button>
          </>
        )}
      </CardFooter>

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
    </Card>
  )
}

export function PublisherDraftList() {
  const { drafts, createDraft, isLoading } = usePublisherDraftStore()
  const [showArchived, setShowArchived] = useState(false)

  // Filter to only show draft status (non-archived) - published drafts appear in History tab
  // Sort by updatedAt descending (newest first)
  const activeDrafts = drafts
    .filter((d) => d.status === 'draft' && !d.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const archivedDrafts = drafts
    .filter((d) => d.archived)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  if (isLoading) {
    return <LoadingState />
  }

  if (activeDrafts.length === 0 && archivedDrafts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No drafts yet"
        description="Create your first draft to save work in progress before publishing."
        action={
          <div className="flex gap-2">
            <Button onClick={() => createDraft(1)}>New Short Note</Button>
            <Button variant="outline" onClick={() => createDraft(30023)}>
              New Article
            </Button>
          </div>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      {activeDrafts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeDrafts.map((draft) => (
            <PublisherDraftCard key={draft.id} draft={draft} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No active drafts"
          description="Create a new draft or restore from archived drafts below."
          action={
            <div className="flex gap-2">
              <Button onClick={() => createDraft(1)}>New Short Note</Button>
              <Button variant="outline" onClick={() => createDraft(30023)}>
                New Article
              </Button>
            </div>
          }
        />
      )}

      {archivedDrafts.length > 0 && (
        <div className="border-t pt-6">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            {showArchived ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Archive className="h-4 w-4" />
            <span>
              Archived Drafts ({archivedDrafts.length})
            </span>
          </button>

          {showArchived && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {archivedDrafts.map((draft) => (
                <PublisherDraftCard key={draft.id} draft={draft} isArchived />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
