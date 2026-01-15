import { useState, useEffect } from 'react'
import {
  Copy,
  Check,
  Trash2,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { GhostNoteIcon } from '@/components/common/GhostNoteIcon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useGhostNoteStore } from '@/stores/ghostNoteStore'
import {
  revokeGhostNote,
  generateGhostNoteURL,
  formatExpiration,
  formatExpirationDateTime,
  isGhostNoteExpired,
} from '@/lib/nostr/ghostNote'
import { fetchProfile, getDisplayName } from '@/services/profileSearchService'
import { toast } from '@/hooks/useToast'
import type { GhostNote, GhostNoteStatus } from '@/types/ghostNote'

interface ProfileCache {
  [pubkey: string]: {
    name: string
    picture?: string
  }
}

export function SentGhostNotes() {
  const {
    getSentGhostNotes,
    markAsRevoked,
    cleanupExpiredNotes,
  } = useGhostNoteStore()

  const [profileCache, setProfileCache] = useState<ProfileCache>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<GhostNote | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [showRevoked, setShowRevoked] = useState(false)
  const [showExpired, setShowExpired] = useState(false)

  const allNotes = getSentGhostNotes()

  // Cleanup expired notes on mount
  useEffect(() => {
    cleanupExpiredNotes()
  }, [cleanupExpiredNotes])

  // Fetch profiles for counterparties
  useEffect(() => {
    const pubkeys = allNotes
      .map((n) => n.counterpartyPubkey)
      .filter((p) => !profileCache[p])

    if (pubkeys.length > 0) {
      const uniquePubkeys = [...new Set(pubkeys)]
      uniquePubkeys.forEach(async (pubkey) => {
        try {
          const profile = await fetchProfile(pubkey)
          if (profile) {
            setProfileCache((prev) => ({
              ...prev,
              [pubkey]: {
                name: getDisplayName(profile),
                picture: profile.picture,
              },
            }))
          }
        } catch {
          // Ignore fetch errors
        }
      })
    }
  }, [allNotes, profileCache])

  // Categorize notes
  const activeNotes = allNotes.filter((n) => n.status === 'active')
  const readNotes = allNotes.filter((n) => n.status === 'read')
  const revokedNotes = allNotes.filter((n) => n.status === 'revoked')
  const expiredNotes = allNotes.filter((n) => n.status === 'expired')

  const handleCopyLink = async (note: GhostNote) => {
    const link = generateGhostNoteURL(note.dTag)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(note.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      })
    }
  }

  const handleRevokeClick = (note: GhostNote) => {
    setSelectedNote(note)
    setRevokeDialogOpen(true)
  }

  const handleRevokeConfirm = async () => {
    if (!selectedNote || !selectedNote.eventId) {
      toast({
        title: 'Cannot revoke',
        description: 'Ghost Note has no event ID',
        variant: 'destructive',
      })
      return
    }

    setIsRevoking(true)
    try {
      const result = await revokeGhostNote(
        selectedNote.eventId,
        selectedNote.relayUrls
      )

      if (result.success) {
        markAsRevoked(selectedNote.id)
        toast({
          title: 'Ghost Note revoked',
          description: `Deleted from ${result.deletedFromRelays.length} relays`,
        })
      } else {
        throw new Error(result.error || 'Revocation failed')
      }
    } catch (error) {
      console.error('[SentGhostNotes] Revoke failed:', error)
      toast({
        title: 'Revocation failed',
        description:
          error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      })
    } finally {
      setIsRevoking(false)
      setRevokeDialogOpen(false)
      setSelectedNote(null)
    }
  }

  const getStatusIcon = (status: GhostNoteStatus) => {
    switch (status) {
      case 'active':
        return <EyeOff className="h-4 w-4 text-green-500" />
      case 'read':
        return <Eye className="h-4 w-4 text-yellow-500" />
      case 'revoked':
        return <Trash2 className="h-4 w-4 text-muted-foreground" />
      case 'expired':
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusLabel = (note: GhostNote): string => {
    switch (note.status) {
      case 'active':
        return 'Unread'
      case 'read':
        return note.readAt
          ? `Read ${formatTimeAgo(note.readAt)}`
          : 'Read'
      case 'revoked':
        return note.revokedAt
          ? `Revoked ${formatTimeAgo(note.revokedAt)}`
          : 'Revoked'
      case 'expired':
        return 'Expired'
    }
  }

  // Compact render for archived notes (read/revoked/expired) - no recipient info for privacy
  const renderArchivedNote = (note: GhostNote) => {
    const statusIcon = getStatusIcon(note.status)
    const statusText = note.status === 'read'
      ? `Viewed ${formatTimeAgo(note.readAt || note.createdAt)}`
      : note.status === 'revoked'
        ? `Revoked ${formatTimeAgo(note.revokedAt || note.createdAt)}`
        : `Expired ${formatTimeAgo(note.expiration)}`

    return (
      <div
        key={note.id}
        className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded text-xs text-muted-foreground"
      >
        <div className="flex items-center gap-2">
          {statusIcon}
          <span>{statusText}</span>
        </div>
        <span className="italic">Sent {formatTimeAgo(note.createdAt)}</span>
      </div>
    )
  }

  const renderNote = (note: GhostNote, showActions: boolean = true) => {
    const profile = profileCache[note.counterpartyPubkey]
    const isExpired = isGhostNoteExpired(note.expiration)

    return (
      <Card key={note.id} className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <img
              src={
                profile?.picture ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${note.counterpartyPubkey}`
              }
              alt=""
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  To: {profile?.name || formatPubkey(note.counterpartyPubkey)}
                </span>
                <span className="flex items-center gap-1 text-xs">
                  {getStatusIcon(note.status)}
                  {getStatusLabel(note)}
                </span>
              </div>

              <div className="text-xs text-muted-foreground mt-1">
                Sent {formatTimeAgo(note.createdAt)}
              </div>

              {note.status === 'active' && !isExpired && (
                <div className="text-xs text-muted-foreground">
                  Expires: {formatExpirationDateTime(note.expiration)} (
                  {formatExpiration(note.expiration)})
                </div>
              )}

              {showActions && note.status === 'active' && !isExpired && (
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyLink(note)}
                    className="h-8"
                  >
                    {copiedId === note.id ? (
                      <>
                        <Check className="h-3 w-3 mr-1.5 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1.5" />
                        Copy Link
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevokeClick(note)}
                    className="h-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3 mr-1.5" />
                    Revoke
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Active Notes */}
      {activeNotes.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Active ({activeNotes.length})
          </h3>
          <div className="space-y-3">
            {activeNotes.map((note) => renderNote(note))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <GhostNoteIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No active Ghost Notes</p>
          <p className="text-sm mt-1">Send your first secret message</p>
        </div>
      )}

      {/* Read Notes - compact view */}
      {readNotes.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowRead(!showRead)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Eye className="h-4 w-4" />
            Read ({readNotes.length})
            {showRead ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showRead && (
            <div className="space-y-1">
              {readNotes.map((note) => renderArchivedNote(note))}
            </div>
          )}
        </div>
      )}

      {/* Revoked Notes - compact view */}
      {revokedNotes.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowRevoked(!showRevoked)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Revoked ({revokedNotes.length})
            {showRevoked ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showRevoked && (
            <div className="space-y-1">
              {revokedNotes.map((note) => renderArchivedNote(note))}
            </div>
          )}
        </div>
      )}

      {/* Expired Notes - compact view */}
      {expiredNotes.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowExpired(!showExpired)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="h-4 w-4" />
            Expired ({expiredNotes.length})
            {showExpired ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showExpired && (
            <div className="space-y-1">
              {expiredNotes.map((note) => renderArchivedNote(note))}
            </div>
          )}
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Ghost Note?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                {selectedNote && (
                  <>
                    <p>
                      You're about to revoke the Ghost Note sent to{' '}
                      <strong>
                        {profileCache[selectedNote.counterpartyPubkey]?.name ||
                          formatPubkey(selectedNote.counterpartyPubkey)}
                      </strong>
                      .
                    </p>
                    <ul className="mt-3 space-y-1 text-sm list-none">
                      <li>• The note will be deleted from relays</li>
                      <li>• The recipient can no longer read it</li>
                      <li>• This cannot be undone</li>
                    </ul>
                    <p className="mt-3">
                      Status:{' '}
                      <span className="inline-flex items-center gap-1">
                        {getStatusIcon(selectedNote.status)}
                        {getStatusLabel(selectedNote)}
                      </span>
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeConfirm}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? 'Revoking...' : 'Revoke Now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Helper functions
function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  return new Date(timestamp * 1000).toLocaleDateString()
}

function formatPubkey(pubkey: string): string {
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`
}
