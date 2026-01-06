import { User, FileText } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/common/StatusBadge'
import { useSubmissionStore } from '@/stores/submissionStore'
import type { Submission } from '@/types/submission'

interface SubmissionCardProps {
  submission: Submission
}

export function SubmissionCard({ submission }: SubmissionCardProps) {
  const { setCurrentSubmission } = useSubmissionStore()

  const handleReview = () => {
    setCurrentSubmission(submission.id)
  }

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
    <Card className="flex flex-col hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">
              Kind {submission.kind === 1 ? '1 (Note)' : '30023 (Article)'}
            </span>
          </div>
          <StatusBadge status={submission.status} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <User className="h-3 w-3" />
          <span className="truncate">{submission.delegateNpub.slice(0, 16)}...</span>
          <span>•</span>
          <span>{formattedDate}</span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3">{excerpt}</p>
        {submission.note && (
          <div className="mt-2 text-xs bg-muted p-2 rounded">
            <span className="font-medium">Note:</span> {submission.note}
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={handleReview}
        >
          Review
        </Button>
      </CardFooter>
    </Card>
  )
}
