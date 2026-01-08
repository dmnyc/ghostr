import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InboxQueue } from './InboxQueue'
import { ReviewPane } from './ReviewPane'
import { HistoryList } from './HistoryList'
import { ArchivedSubmissionsList } from './ArchivedSubmissionsList'
import { DirectPostEditor } from './DirectPostEditor'
import { EditArticleEditor } from './EditArticleEditor'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSubmissionStore, initializeProcessedIds, syncProcessedIdsFromRelay } from '@/stores/submissionStore'
import { useAdminInbox } from '@/hooks/useAdminInbox'
import { usePublishHistoryStore, type PublishedItem } from '@/stores/publishHistoryStore'

export function PublisherDashboard() {
  const { currentSubmissionId, setCurrentSubmission, isLoading, submissions, archivedSubmissions } = useSubmissionStore()
  const { getUnreadCount, markAsViewed } = usePublishHistoryStore()
  const [activeTab, setActiveTab] = useState('inbox')
  const [isCreatingPost, setIsCreatingPost] = useState(false)
  const [editingArticle, setEditingArticle] = useState<PublishedItem | null>(null)

  // Initialize processed IDs from localStorage, then sync from relay
  useEffect(() => {
    initializeProcessedIds()
    // Async load from relay and merge (runs in background)
    syncProcessedIdsFromRelay()
  }, [])

  // Subscribe to inbox
  useAdminInbox()

  const handleBack = () => {
    setCurrentSubmission(null)
  }

  if (isCreatingPost) {
    return <DirectPostEditor onBack={() => setIsCreatingPost(false)} />
  }

  if (editingArticle) {
    return <EditArticleEditor item={editingArticle} onBack={() => setEditingArticle(null)} />
  }

  if (currentSubmissionId) {
    return <ReviewPane onBack={handleBack} />
  }

  const pendingCount = submissions.filter((s) => s.status === 'pending').length
  const archivedCount = archivedSubmissions.length
  const unreadHistoryCount = getUnreadCount()

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === 'history') {
      markAsViewed()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Publisher Dashboard</h1>
          <p className="text-muted-foreground">
            Review and publish content submitted by delegates
          </p>
        </div>
        <Button onClick={() => setIsCreatingPost(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Post
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="inbox">
            Inbox {pendingCount > 0 && `(${pendingCount})`}
          </TabsTrigger>
          <TabsTrigger value="history" className="relative">
            History
            {unreadHistoryCount > 0 && (
              <span className="ml-1.5 bg-primary text-primary-foreground text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                {unreadHistoryCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived">
            Archived {archivedCount > 0 && `(${archivedCount})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbox" className="mt-4">
          <InboxQueue isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryList onEditArticle={setEditingArticle} />
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <ArchivedSubmissionsList />
        </TabsContent>
      </Tabs>
    </div>
  )
}
