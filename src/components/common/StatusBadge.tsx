import { Badge } from '@/components/ui/badge'
import type { Draft } from '@/types/draft'
import type { Submission } from '@/types/submission'

interface StatusBadgeProps {
  status: Draft['status'] | Submission['status']
}

export function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>
    case 'submitted':
    case 'pending':
      return <Badge variant="warning">Pending</Badge>
    case 'published':
    case 'approved':
      return <Badge variant="success">Published</Badge>
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}
