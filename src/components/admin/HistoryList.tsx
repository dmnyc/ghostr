import { Trash2, Archive, ExternalLink, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSubmissionStore } from '@/stores/submissionStore'
import { pubkeyToNpub } from '@/stores/authStore'
import type { Submission } from '@/types/submission'

export function HistoryList() {
  const { submissions, removeSubmission, archiveSubmission } = useSubmissionStore()

  const processedSubmissions = submissions.filter(
    (s) => s.status === 'approved' || s.status === 'rejected'
  )

  if (processedSubmissions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No history yet. Published and rejected submissions will appear here.
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {processedSubmissions.map((submission) => (
        <HistoryItem
          key={submission.id}
          submission={submission}
          onDelete={() => removeSubmission(submission.id)}
          onArchive={() => archiveSubmission(submission.id)}
        />
      ))}
    </div>
  )
}

interface HistoryItemProps {
  submission: Submission
  onDelete: () => void
  onArchive: () => void
}

function HistoryItem({ submission, onDelete, onArchive }: HistoryItemProps) {
  const isApproved = submission.status === 'approved'
  const excerpt = submission.content.slice(0, 60) + (submission.content.length > 60 ? '...' : '')
  const delegateShort = pubkeyToNpub(submission.delegatePubkey).slice(0, 12) + '...'

  const formattedDate = new Date(submission.receivedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 group">
      {/* Status icon */}
      <div className={`shrink-0 ${isApproved ? 'text-green-500' : 'text-destructive'}`}>
        {isApproved ? (
          <Check className="h-4 w-4" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{excerpt}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            Kind {submission.kind}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {delegateShort} • {formattedDate}
        </div>
      </div>

      {/* Actions - visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isApproved && (
          <a
            href={`https://njump.me/${submission.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent"
            title="View on Nostr"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onArchive}
          title="Archive"
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
