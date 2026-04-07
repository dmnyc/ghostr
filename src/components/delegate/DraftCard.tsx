import { FileText, Trash2, Archive, RotateCcw, Undo2 } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/StatusBadge'
import { useDraftStore } from '@/stores/draftStore'
import type { Draft } from '@/types/draft'
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

interface DraftCardProps {
  draft: Draft
  isArchived?: boolean
}

export function DraftCard({ draft, isArchived = false }: DraftCardProps) {
  const { setCurrentDraft, deleteDraft, archiveDraft, retractSubmission, updateDraft, saveDraft } = useDraftStore()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showRetractDialog, setShowRetractDialog] = useState(false)
  const [isRetracting, setIsRetracting] = useState(false)

  const handleView = () => {
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

  const handleRetract = async () => {
    setShowRetractDialog(false)
    setIsRetracting(true)
    try {
      await retractSubmission(draft.id)
      toast({
        title: 'Submission retracted',
        description: 'Your submission has been withdrawn. You can edit and resubmit.',
      })
    } catch (error) {
      toast({
        title: 'Retraction failed',
        description: error instanceof Error ? error.message : 'Failed to retract submission.',
        variant: 'destructive',
      })
    } finally {
      setIsRetracting(false)
    }
  }

  const handleArchive = async () => {
    if (window.confirm('Archive this submission? It will be hidden from your drafts list.')) {
      await archiveDraft(draft.id)
      toast({
        title: 'Draft archived',
        description: 'Your draft has been moved to the archive.',
      })
    }
  }

  const handleUnarchive = async () => {
    updateDraft(draft.id, { archived: false })
    await saveDraft(draft.id)
    toast({
      title: 'Draft restored',
      description: 'Your draft has been moved back to the drafts list.',
    })
  }

  const isSubmitted = draft.status === 'submitted'

  const excerpt = draft.content
    ? draft.content.slice(0, 100) + (draft.content.length > 100 ? '...' : '')
    : 'No content yet'

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
          {!isArchived && <StatusBadge status={draft.status} />}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Kind {draft.targetKind === 1 ? '1 (Note)' : '30023 (Article)'}</span>
          <span>•</span>
          <span>{formattedDate}</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3 break-all">{excerpt}</p>
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
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handleView}
            >
              {isSubmitted ? 'View' : 'Edit'}
            </Button>
            {draft.status === 'draft' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                  title="Delete draft"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleArchive}
                  title="Archive draft"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </>
            )}
            {isSubmitted && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRetractDialog(true)}
                  disabled={isRetracting}
                  title="Retract submission"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleArchive}
                  title="Archive submission"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </>
            )}
          </>
        )}
      </CardFooter>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this draft from both your local storage and relays. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRetractDialog} onOpenChange={setShowRetractDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retract submission?</AlertDialogTitle>
            <AlertDialogDescription>
              This will withdraw your submission from the publisher's inbox. Your draft will return to editable state so you can modify and resubmit it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRetract}>
              Retract submission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
