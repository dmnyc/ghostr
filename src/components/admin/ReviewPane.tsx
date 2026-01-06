import { useState, useEffect } from 'react'
import { ArrowLeft, Check, X, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/common/StatusBadge'
import { PublishDialog } from './PublishDialog'
import { FeedbackDialog } from './FeedbackDialog'
import { useSubmissionStore } from '@/stores/submissionStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { fetchProfile, getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'

interface ReviewPaneProps {
  onBack: () => void
}

export function ReviewPane({ onBack }: ReviewPaneProps) {
  const { getCurrentSubmission } = useSubmissionStore()
  const { creditGhostr } = useSettingsStore()
  const { isPublishDialogOpen, setPublishDialogOpen } = useUIStore()

  const submission = getCurrentSubmission()

  const [editedContent, setEditedContent] = useState(submission?.content ?? '')
  const [isFeedbackDialogOpen, setFeedbackDialogOpen] = useState(false)
  const [includeCredit, setIncludeCredit] = useState(creditGhostr)
  const [delegateProfile, setDelegateProfile] = useState<SearchProfile | null>(null)

  // Fetch delegate profile
  useEffect(() => {
    if (submission?.delegatePubkey) {
      fetchProfile(submission.delegatePubkey).then(setDelegateProfile)
    }
  }, [submission?.delegatePubkey])

  if (!submission) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Submission not found</p>
        <Button onClick={onBack} variant="link">
          Go back
        </Button>
      </div>
    )
  }

  const isProcessed = submission.status !== 'pending'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Review Submission</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={submission.status} />
              <span className="text-sm text-muted-foreground">
                Kind {submission.kind === 1 ? '1 (Note)' : '30023 (Article)'}
              </span>
            </div>
          </div>
        </div>

        {!isProcessed && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeCredit}
                onChange={(e) => setIncludeCredit(e.target.checked)}
                className="rounded border-muted-foreground"
              />
              Credit Ghostr
            </label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setFeedbackDialogOpen(true)}
              >
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button onClick={() => setPublishDialogOpen(true)}>
                <Check className="mr-2 h-4 w-4" />
                Publish
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px] items-start">
        <div className="rounded-lg border p-4 space-y-4">
          <div className="space-y-2">
            <Label>Content {!isProcessed && '(Editable)'}</Label>
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              disabled={isProcessed}
              className={submission.kind === 30023 ? 'min-h-[400px] font-mono' : 'min-h-[200px]'}
            />
            <p className="text-xs text-muted-foreground">
              {editedContent.length} characters
              {editedContent !== submission.content && ' (modified)'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium">Submission Details</h3>

            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">From:</span>
              <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                {delegateProfile?.picture ? (
                  <img
                    src={delegateProfile.picture}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {delegateProfile ? getDisplayName(delegateProfile) : 'Loading...'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {delegateProfile?.nip05 || formatNpub(submission.delegatePubkey)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Received:</span>
              <p className="text-sm">
                {new Date(submission.receivedAt).toLocaleString()}
              </p>
            </div>

            {submission.note && (
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground">Note from delegate:</span>
                <p className="text-sm bg-muted p-2 rounded">{submission.note}</p>
              </div>
            )}
          </div>

          {submission.tags.length > 0 && (
            <div className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {submission.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs bg-muted px-2 py-1 rounded"
                  >
                    {tag.join(': ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <PublishDialog
        open={isPublishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        submission={submission}
        editedContent={editedContent}
        onSuccess={onBack}
        initialCredit={includeCredit}
      />

      <FeedbackDialog
        open={isFeedbackDialogOpen}
        onOpenChange={setFeedbackDialogOpen}
        submission={submission}
        onSuccess={onBack}
      />
    </div>
  )
}
