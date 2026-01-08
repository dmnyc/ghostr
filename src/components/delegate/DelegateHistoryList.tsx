import { FileText, ExternalLink, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { useDraftStore } from '@/stores/draftStore'
import type { Draft } from '@/types/draft'

export function DelegateHistoryList() {
  const { drafts, setCurrentDraft, deleteDraft } = useDraftStore()

  const publishedDrafts = drafts.filter((d) => d.status === 'published')

  const handleView = (draft: Draft) => {
    setCurrentDraft(draft.id)
  }

  const handleDelete = async (draft: Draft) => {
    if (window.confirm('Are you sure you want to delete this from history?')) {
      await deleteDraft(draft.id)
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

  if (publishedDrafts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No published posts yet"
        description="Posts that have been approved and published by a publisher will appear here."
      />
    )
  }

  return (
    <div className="space-y-2">
      {publishedDrafts.map((draft) => (
        <div
          key={draft.id}
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
        >
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
                {draft.publishedEventId && (
                  <span className="ml-2">
                    Event: {draft.publishedEventId.slice(0, 8)}...
                  </span>
                )}
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
            {draft.publishedEventId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => window.open(`https://njump.me/${draft.publishedEventId}`, '_blank')}
                title="View on Nostr"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
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
      ))}
    </div>
  )
}
