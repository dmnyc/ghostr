import { FileText, Eye, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { useDraftStore } from '@/stores/draftStore'
import type { Draft } from '@/types/draft'

export function RejectedList() {
  const { drafts, setCurrentDraft, deleteDraft, updateDraft, saveDrafts } = useDraftStore()

  const rejectedDrafts = drafts.filter((d) => d.status === 'rejected')

  const handleView = (draft: Draft) => {
    setCurrentDraft(draft.id)
  }

  const handleResubmit = async (draft: Draft) => {
    // Reset to draft status so user can edit and resubmit
    // Keep rejectionReason so it displays in editor as context
    updateDraft(draft.id, {
      status: 'draft',
      submittedTo: undefined,
    })
    await saveDrafts()
    setCurrentDraft(draft.id)
  }

  const handleDelete = async (draft: Draft) => {
    if (window.confirm('Are you sure you want to delete this rejected draft?')) {
      deleteDraft(draft.id)
      await saveDrafts()
    }
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
                variant="ghost"
                size="sm"
                onClick={() => handleView(draft)}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResubmit(draft)}
                title="Edit and resubmit"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(draft)}
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
    </div>
  )
}
