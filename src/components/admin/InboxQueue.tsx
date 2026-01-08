import { Inbox } from 'lucide-react'
import { SubmissionCard } from './SubmissionCard'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingState } from '@/components/common/LoadingState'
import { useSubmissionStore } from '@/stores/submissionStore'

interface InboxQueueProps {
  isLoading: boolean
}

export function InboxQueue({ isLoading }: InboxQueueProps) {
  const { submissions } = useSubmissionStore()

  const pendingSubmissions = submissions.filter((s) => s.status === 'pending')

  if (isLoading) {
    return <LoadingState />
  }

  if (pendingSubmissions.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No pending submissions"
        description="Submissions from delegates will appear here when they send content for review."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {pendingSubmissions.length} pending submission
        {pendingSubmissions.length !== 1 ? 's' : ''}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pendingSubmissions.map((submission) => (
          <SubmissionCard key={submission.id} submission={submission} />
        ))}
      </div>
    </div>
  )
}
