import { useEffect, useState } from 'react'
import { Plus, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DraftList } from './DraftList'
import { DraftEditor } from './DraftEditor'
import { DelegateHistoryList } from './DelegateHistoryList'
import { RejectedList } from './RejectedList'
import { useDraftStore } from '@/stores/draftStore'
import { useAuthStore } from '@/stores/authStore'
import { useDelegateReceipts } from '@/hooks/useDelegateReceipts'

export function DelegateDashboard() {
  const { isAuthenticated } = useAuthStore()
  const {
    drafts,
    currentDraftId,
    loadDrafts,
    createDraft,
    setCurrentDraft,
    isLoading,
    unseenRejectionIds,
    dismissAllRejections,
  } = useDraftStore()
  const [activeTab, setActiveTab] = useState('drafts')

  // Listen for receipts from admins (approval/rejection notifications)
  useDelegateReceipts()

  useEffect(() => {
    if (isAuthenticated) {
      loadDrafts()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  const handleNewDraft = () => {
    createDraft()
  }

  const handleBack = () => {
    setCurrentDraft(null)
  }

  if (currentDraftId) {
    return <DraftEditor onBack={handleBack} />
  }

  const activeDrafts = drafts.filter((d) => (d.status === 'draft' || d.status === 'submitted') && !d.archived)
  const rejectedDrafts = drafts.filter((d) => d.status === 'rejected' && !d.archived)
  const publishedCount = drafts.filter((d) => d.status === 'published').length
  const rejectedCount = rejectedDrafts.length

  // Get unseen rejected drafts for the banner
  const unseenRejectedDrafts = rejectedDrafts.filter((d) => unseenRejectionIds.has(d.id))
  const hasUnseenRejections = unseenRejectedDrafts.length > 0

  const handleViewRejected = () => {
    setActiveTab('rejected')
    dismissAllRejections()
  }

  return (
    <div className="space-y-6">
      {/* Rejection Banner */}
      {hasUnseenRejections && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-destructive">
                  {unseenRejectedDrafts.length === 1
                    ? 'Your submission was rejected'
                    : `${unseenRejectedDrafts.length} submissions were rejected`}
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  {unseenRejectedDrafts.length === 1 && unseenRejectedDrafts[0]
                    ? `"${unseenRejectedDrafts[0].title || 'Untitled'}" was rejected by the publisher.`
                    : 'Check the Rejected tab to see feedback and edit your drafts.'}
                  {unseenRejectedDrafts.length === 1 && unseenRejectedDrafts[0]?.rejectionReason && (
                    <span className="block mt-1 italic">"{unseenRejectedDrafts[0].rejectionReason}"</span>
                  )}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 h-auto mt-2 text-destructive"
                  onClick={handleViewRejected}
                >
                  View rejected {unseenRejectedDrafts.length === 1 ? 'draft' : 'drafts'} →
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0"
              onClick={dismissAllRejections}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Your Drafts</h1>
          <p className="text-muted-foreground">
            Create and manage content drafts for review
          </p>
        </div>
        <Button onClick={handleNewDraft} className="self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" />
          New Draft
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="drafts">
            Drafts {activeDrafts.length > 0 && `(${activeDrafts.length})`}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected {rejectedCount > 0 && `(${rejectedCount})`}
          </TabsTrigger>
          <TabsTrigger value="published">
            Published {publishedCount > 0 && `(${publishedCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="drafts" className="mt-4">
          <DraftList isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <RejectedList />
        </TabsContent>

        <TabsContent value="published" className="mt-4">
          <DelegateHistoryList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
