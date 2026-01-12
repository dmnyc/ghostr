import { FileText, Archive, ChevronDown, ChevronRight } from 'lucide-react'
import { DraftCard } from './DraftCard'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingState } from '@/components/common/LoadingState'
import { Button } from '@/components/ui/button'
import { useDraftStore } from '@/stores/draftStore'
import { useState } from 'react'

interface DraftListProps {
  isLoading: boolean
}

export function DraftList({ isLoading }: DraftListProps) {
  const { drafts, createDraft } = useDraftStore()
  const [showArchived, setShowArchived] = useState(false)

  // Filter to only show drafts and submitted (non-archived) - published/rejected have their own tabs
  // Sort by updatedAt descending (newest first)
  const activeDrafts = drafts
    .filter((d) =>
      (d.status === 'draft' || d.status === 'submitted') && !d.archived
    )
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
        description="Create your first draft to get started with content creation."
        action={
          <Button onClick={() => createDraft()}>Create Draft</Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      {activeDrafts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeDrafts.map((draft) => (
            <DraftCard key={draft.id} draft={draft} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No active drafts"
          description="Create a new draft or restore from archived drafts below."
          action={
            <Button onClick={() => createDraft()}>Create Draft</Button>
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
                <DraftCard key={draft.id} draft={draft} isArchived />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
