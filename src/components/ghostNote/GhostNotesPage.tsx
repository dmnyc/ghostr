import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Send, Inbox } from 'lucide-react'
import { GhostNoteIcon } from '@/components/common/GhostNoteIcon'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUnreadGhostNoteCount } from '@/stores/ghostNoteStore'
import { SentGhostNotes } from './SentGhostNotes'
import { ReceivedGhostNotes } from './ReceivedGhostNotes'
import { GhostNoteCompose } from './GhostNoteCompose'

export function GhostNotesPage() {
  const navigate = useNavigate()
  const { tab } = useParams<{ tab?: string }>()
  const unreadCount = useUnreadGhostNoteCount()
  const [composeOpen, setComposeOpen] = useState(false)

  // Derive active tab from URL param, default to 'received'
  const activeTab = tab === 'sent' ? 'sent' : 'received'

  const handleTabChange = (value: string) => {
    navigate(`/ghost-notes/${value}`, { replace: true })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <GhostNoteIcon className="h-6 w-6" />
            Ghost Notes
          </h1>
          <p className="text-sm text-muted-foreground">
            Encrypted, self-destructing secret messages
          </p>
        </div>
        <Button onClick={() => setComposeOpen(true)}>
          <GhostNoteIcon className="h-4 w-4 mr-2" />
          New
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
      >
        <TabsList className="w-full">
          <TabsTrigger value="received" className="flex-1 gap-2">
            <Inbox className="h-4 w-4" />
            Received
            {unreadCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex-1 gap-2">
            <Send className="h-4 w-4" />
            Sent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="mt-6">
          <ReceivedGhostNotes />
        </TabsContent>

        <TabsContent value="sent" className="mt-6">
          <SentGhostNotes />
        </TabsContent>
      </Tabs>

      {/* Compose Dialog */}
      <GhostNoteCompose open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  )
}
