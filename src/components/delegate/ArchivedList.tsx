import { Archive, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { StatusBadge } from '@/components/common/StatusBadge'
import { useDraftStore } from '@/stores/draftStore'

export function ArchivedList() {
  const { drafts, updateDraft, saveDraft } = useDraftStore()

  const archivedDrafts = drafts.filter((d) => d.archived)

  const handleUnarchive = async (id: string) => {
    updateDraft(id, { archived: false })
    await saveDraft(id)
  }

  if (archivedDrafts.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="No archived items"
        description="Archived submissions will appear here."
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {archivedDrafts.map((draft) => {
        const excerpt = draft.content
          ? draft.content.slice(0, 100) + (draft.content.length > 100 ? '...' : '')
          : 'No content'

        const formattedDate = new Date(draft.updatedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

        return (
          <Card key={draft.id} className="flex flex-col opacity-75">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium truncate">
                  {draft.title || 'Untitled Draft'}
                </h3>
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

            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => handleUnarchive(draft.id)}
              >
                <RotateCcw className="h-4 w-4" />
                Restore
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
