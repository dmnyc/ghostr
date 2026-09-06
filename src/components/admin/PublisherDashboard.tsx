import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InboxQueue } from './InboxQueue'
import { ReviewPane } from './ReviewPane'
import { HistoryList } from './HistoryList'
import { ArchivedSubmissionsList } from './ArchivedSubmissionsList'
import { DirectPostEditor } from './DirectPostEditor'
import { EditArticleEditor } from './EditArticleEditor'
import { PublisherDraftList } from './PublisherDraftList'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useSubmissionStore, initializeProcessedIds, syncProcessedIdsFromRelay } from '@/stores/submissionStore'
import { useAdminInbox } from '@/hooks/useAdminInbox'
import { usePublishHistoryStore, type PublishedItem } from '@/stores/publishHistoryStore'
import { usePublisherDraftStore } from '@/stores/publisherDraftStore'

export function PublisherDashboard() {
  const { currentSubmissionId, setCurrentSubmission, isLoading, submissions, archivedSubmissions } = useSubmissionStore()
  const { getUnreadCount, markAsViewed } = usePublishHistoryStore()
  const { loadDrafts, drafts, currentDraftId, setCurrentDraft } = usePublisherDraftStore()
  const [activeTab, setActiveTab] = useState('inbox')
  const [isCreatingPost, setIsCreatingPost] = useState(false)
  const [editingArticle, setEditingArticle] = useState<PublishedItem | null>(null)
  const [idsReady, setIdsReady] = useState(false)

  // Initialize processed IDs from localStorage, then sync from relay in background
  useEffect(() => {
    // Immediately load from localStorage (fast, synchronous)
    initializeProcessedIds()
    // Allow inbox to load right away
    setIdsReady(true)

    // Sync from relay in background (slow, async)
    // This will merge relay data with localStorage without blocking the UI
    syncProcessedIdsFromRelay().catch(() => {
      // Silently fail - localStorage values are already loaded
    })
  }, [])

  // Load publisher drafts on mount
  useEffect(() => {
    loadDrafts()
  }, [loadDrafts])

  // Subscribe to inbox only after IDs are ready
  useAdminInbox(idsReady)

  const handleBack = () => {
    setCurrentSubmission(null)
  }

  const handleDraftEditorBack = () => {
    setCurrentDraft(null)
  }

  if (isCreatingPost || currentDraftId) {
    return <DirectPostEditor onBack={() => {
      setIsCreatingPost(false)
      handleDraftEditorBack()
    }} />
  }

  if (editingArticle) {
    return <EditArticleEditor item={editingArticle} onBack={() => setEditingArticle(null)} />
  }

  if (currentSubmissionId) {
    return <ReviewPane onBack={handleBack} />
  }

  const pendingCount = submissions.filter((s) => s.status === 'pending').length
  const archivedSubmissionsCount = archivedSubmissions.length
  // Drafts from other clients live in their own section and don't count toward the tab badge
  const draftCount = drafts.filter((d) => d.status === 'draft' && !d.archived && !d.external).length
  const unreadHistoryCount = getUnreadCount()

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === 'history') {
      markAsViewed()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Publisher Dashboard</h1>
          <p className="text-muted-foreground">
            Review and publish content submitted by delegates
          </p>
        </div>
        <Button onClick={() => setIsCreatingPost(true)} className="self-start h-12 px-7 text-lg sm:self-auto">
          <Plus className="mr-2 h-5 w-5" />
          New Post
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="inbox">
            Inbox {pendingCount > 0 && `(${pendingCount})`}
          </TabsTrigger>
          <TabsTrigger value="drafts">
            Drafts {draftCount > 0 && `(${draftCount})`}
          </TabsTrigger>
          <TabsTrigger value="history" className="relative">
            History
            {unreadHistoryCount > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                {unreadHistoryCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived-submissions">
            Archived {archivedSubmissionsCount > 0 && `(${archivedSubmissionsCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <InboxQueue isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="drafts" className="mt-4">
          <PublisherDraftList />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ErrorBoundary label="history">
            <HistoryList onEditArticle={setEditingArticle} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="archived-submissions" className="mt-4">
          <ArchivedSubmissionsList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
