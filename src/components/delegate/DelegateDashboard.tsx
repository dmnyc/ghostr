import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
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
  } = useDraftStore()
  const [activeTab, setActiveTab] = useState('drafts')

  // Listen for receipts from admins (approval/rejection notifications)
  useDelegateReceipts()

  useEffect(() => {
    if (isAuthenticated) {
      loadDrafts()
    }
  }, [isAuthenticated, loadDrafts])

  const handleNewDraft = () => {
    createDraft()
  }

  const handleBack = () => {
    setCurrentDraft(null)
  }

  if (currentDraftId) {
    return <DraftEditor onBack={handleBack} />
  }

  const activeDrafts = drafts.filter((d) => d.status === 'draft' || d.status === 'submitted')
  const publishedCount = drafts.filter((d) => d.status === 'published').length
  const rejectedCount = drafts.filter((d) => d.status === 'rejected').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your Drafts</h1>
          <p className="text-muted-foreground">
            Create and manage content drafts for review
          </p>
        </div>
        <Button onClick={handleNewDraft}>
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
