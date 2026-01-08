import { Archive, Undo2 } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ProfileDisplay } from '@/components/common/ProfileDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { useSubmissionStore } from '@/stores/submissionStore'
import type { Submission } from '@/types/submission'

function ArchivedSubmissionCard({ submission }: { submission: Submission }) {
  const { unarchiveSubmission } = useSubmissionStore()

  const excerpt = submission.content
    ? submission.content.slice(0, 100) + (submission.content.length > 100 ? '...' : '')
    : 'No content'

  const formattedDate = new Date(submission.receivedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Card className="flex flex-col opacity-75 hover:opacity-100 transition-opacity">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ProfileDisplay
            pubkey={submission.delegatePubkey}
            npub={submission.delegateNpub}
            size="sm"
          />
          <span>•</span>
          <span>{formattedDate}</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3 break-all">{excerpt}</p>
        {submission.note && (
          <div className="mt-2 text-xs bg-muted p-2 rounded break-words">
            <span className="font-medium">Note:</span> {submission.note}
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => unarchiveSubmission(submission.id)}
        >
          <Undo2 className="mr-2 h-4 w-4" />
          Restore to Inbox
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ArchivedSubmissionsList() {
  const { archivedSubmissions } = useSubmissionStore()

  if (archivedSubmissions.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="No archived submissions"
        description="Submissions you archive without reviewing will appear here."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {archivedSubmissions.length} archived submission
        {archivedSubmissions.length !== 1 ? 's' : ''}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {archivedSubmissions.map((submission) => (
          <ArchivedSubmissionCard key={submission.id} submission={submission} />
        ))}
      </div>
    </div>
  )
}
