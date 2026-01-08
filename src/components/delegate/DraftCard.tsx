import { FileText, Trash2, Archive } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/StatusBadge'
import { useDraftStore } from '@/stores/draftStore'
import type { Draft } from '@/types/draft'

interface DraftCardProps {
  draft: Draft
}

export function DraftCard({ draft }: DraftCardProps) {
  const { setCurrentDraft, deleteDraft, archiveDraft, saveDraft } = useDraftStore()

  const handleView = () => {
    setCurrentDraft(draft.id)
  }

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this draft?')) {
      await deleteDraft(draft.id)
    }
  }

  const handleArchive = async () => {
    if (window.confirm('Archive this submission? It will be hidden from your drafts list.')) {
      archiveDraft(draft.id)
      await saveDraft(draft.id)
    }
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
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium truncate">
              {draft.title || 'Untitled Draft'}
            </h3>
          </div>
          <StatusBadge status={draft.status} />
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
        <Button
          variant="default"
          size="sm"
          className="flex-1"
          onClick={handleView}
        >
          {isSubmitted ? 'View' : 'Edit'}
        </Button>
        {draft.status === 'draft' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            title="Delete draft"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
        {isSubmitted && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleArchive}
            title="Archive submission"
          >
            <Archive className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
