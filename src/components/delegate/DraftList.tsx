import { FileText, Loader2 } from 'lucide-react'
import { DraftCard } from './DraftCard'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { useDraftStore } from '@/stores/draftStore'

interface DraftListProps {
  isLoading: boolean
}

export function DraftList({ isLoading }: DraftListProps) {
  const { drafts, createDraft } = useDraftStore()

  // Filter to only show drafts and submitted (non-archived) - published/rejected have their own tabs
  const activeDrafts = drafts.filter((d) =>
    (d.status === 'draft' || d.status === 'submitted') && !d.archived
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (activeDrafts.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No drafts yet"
        description="Create your first draft to get started with content creation."
        action={
          <Button onClick={() => createDraft()}>Create Draft</Button>
        }
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {activeDrafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </div>
  )
}
