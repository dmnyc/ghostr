import { FileText, ExternalLink, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
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

export function RejectedList() {
  const { drafts, setCurrentDraft, deleteDraft } = useDraftStore()
  const [deletingDraft, setDeletingDraft] = useState<Draft | null>(null)

  const rejectedDrafts = drafts.filter((d) => d.status === 'rejected' && !d.archived)

  const handleOpen = (draft: Draft) => {
    setCurrentDraft(draft.id)
  }

  const handleDelete = async () => {
    if (!deletingDraft) return
    const draftId = deletingDraft.id
    setDeletingDraft(null)
    await deleteDraft(draftId)
    toast({
      title: 'Draft deleted',
      description: 'Your draft has been permanently deleted.',
    })
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (rejectedDrafts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No rejected submissions"
        description="Submissions that have been rejected by publishers will appear here."
      />
    )
  }

  return (
    <div className="space-y-2">
      {rejectedDrafts.map((draft) => (
        <div
          key={draft.id}
          className="flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">
                    {draft.title || 'Untitled'}
                  </span>
                  <StatusBadge status={draft.status} />
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(draft.updatedAt)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpen(draft)}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeletingDraft(draft)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {draft.rejectionReason && (
            <div className="ml-7 text-sm text-muted-foreground bg-destructive/10 rounded p-2">
              <span className="font-medium text-destructive">Reason:</span> {draft.rejectionReason}
            </div>
          )}
        </div>
      ))}

      <AlertDialog open={!!deletingDraft} onOpenChange={(open) => !open && setDeletingDraft(null)}>
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
    </div>
  )
}
