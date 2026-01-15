import { useState, useEffect, useCallback, useRef } from 'react'
import {
  RefreshCw,
  Eye,
  Clock,
  Lock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'
import { GhostNoteIcon } from '@/components/common/GhostNoteIcon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useGhostNoteStore } from '@/stores/ghostNoteStore'
import { useAuthStore } from '@/stores/authStore'
import {
  readGhostNote,
  sendReadReceipt,
  fetchReceivedGhostNotes,
  formatExpiration,
  formatExpirationDateTime,
  isGhostNoteExpired,
} from '@/lib/nostr/ghostNote'
import { fetchProfile, getDisplayName } from '@/services/profileSearchService'
import { toast } from '@/hooks/useToast'
import type { GhostNote, GhostNoteStatus } from '@/types/ghostNote'
import { v4 as uuidv4 } from 'uuid'

interface ProfileCache {
  [pubkey: string]: {
    name: string
    picture?: string
  }
}

export function ReceivedGhostNotes() {
  const { user } = useAuthStore()
  const {
    getReceivedGhostNotes,
    addGhostNote,
    markAsRead,
    cleanupExpiredNotes,
  } = useGhostNoteStore()

  const [profileCache, setProfileCache] = useState<ProfileCache>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [showExpired, setShowExpired] = useState(false)

  // Read dialog state
  const [readDialogOpen, setReadDialogOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<GhostNote | null>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptedMessage, setDecryptedMessage] = useState<string | null>(null)
  const [copiedContent, setCopiedContent] = useState(false)
  const [viewTimer, setViewTimer] = useState<number>(0)

  // Auto-close timer for decrypted message
  const VIEW_TIMEOUT_SECONDS = 60

  // This ref holds the close handler to avoid stale closures
  const closeDialogRef = useRef<() => void>(() => {
    setReadDialogOpen(false)
    setSelectedNote(null)
    setDecryptedMessage(null)
    setViewTimer(0)
  })

  useEffect(() => {
    if (decryptedMessage && viewTimer > 0) {
      const interval = setInterval(() => {
        setViewTimer((prev) => {
          if (prev <= 1) {
            // Time's up - close the dialog
            closeDialogRef.current()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [decryptedMessage, viewTimer])

  const allNotes = getReceivedGhostNotes()

  // Cleanup expired notes on mount
  useEffect(() => {
    cleanupExpiredNotes()
  }, [cleanupExpiredNotes])

  // Fetch profiles for senders
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
  const unreadNotes = allNotes.filter((n) => n.status === 'active')
  const readNotes = allNotes.filter((n) => n.status === 'read')
  const expiredNotes = allNotes.filter(
    (n) => n.status === 'expired' || n.status === 'revoked'
  )

  const handleRefresh = useCallback(async () => {
    if (!user) return

    setIsRefreshing(true)
    try {
      // Always fetch all notes (don't use since filter) - deduplication happens in addGhostNote
      const events = await fetchReceivedGhostNotes()

      let newCount = 0
      for (const event of events) {
        // Check if we already have this note
        const existingNote = allNotes.find(
          (n) => n.eventId === event.id || n.dTag === event.tags.find((t) => t[0] === 'd')?.[1]
        )
        if (existingNote) continue

        // Extract data from event
        const dTag = event.tags.find((t) => t[0] === 'd')?.[1]
        const expiration = parseInt(
          event.tags.find((t) => t[0] === 'expiration')?.[1] || '0'
        )
        const senderPubkey = event.pubkey

        if (!dTag || !expiration) continue

        // Check if expired
        if (isGhostNoteExpired(expiration)) continue

        // Create new ghost note
        const ghostNote: GhostNote = {
          id: uuidv4(),
          eventId: event.id,
          dTag,
          ownerPubkey: user.pubkey, // The recipient owns this note
          direction: 'received',
          counterpartyPubkey: senderPubkey,
          encryptedContent: event.content,
          decryptedContent: null,
          createdAt: event.created_at || Math.floor(Date.now() / 1000),
          expiration,
          status: 'active',
          readAt: null,
          revokedAt: null,
          relayUrls: [],
          notificationEnabled: false,
        }

        addGhostNote(ghostNote)
        newCount++
      }

      if (newCount > 0) {
        toast({
          title: 'New Ghost Notes',
          description: `Found ${newCount} new Ghost Note${newCount > 1 ? 's' : ''}`,
        })
      }
    } catch (error) {
      console.error('[ReceivedGhostNotes] Refresh failed:', error)
      toast({
        title: 'Refresh failed',
        description: 'Could not fetch new Ghost Notes',
        variant: 'destructive',
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [user, allNotes, addGhostNote])

  // Initial refresh on mount
  useEffect(() => {
    if (user) {
      handleRefresh().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReadClick = (note: GhostNote) => {
    // Run cleanup to update status of any expired notes
    cleanupExpiredNotes()

    // Check if note has expired
    if (isGhostNoteExpired(note.expiration)) {
      toast({
        title: 'Note expired',
        description: 'This Ghost Note has expired and can no longer be read',
        variant: 'destructive',
      })
      return
    }

    setSelectedNote(note)
    setDecryptedMessage(null)
    setCopiedContent(false)
    setReadDialogOpen(true)
  }

  const handleDecrypt = async () => {
    if (!selectedNote) return

    // Check if note has expired
    if (isGhostNoteExpired(selectedNote.expiration)) {
      toast({
        title: 'Note expired',
        description: 'This Ghost Note has expired and can no longer be read',
        variant: 'destructive',
      })
      handleCloseReadDialog()
      return
    }

    setIsDecrypting(true)
    try {
      const result = await readGhostNote(
        selectedNote.eventId || '',
        selectedNote.encryptedContent,
        selectedNote.counterpartyPubkey
      )

      if (result.success && result.plaintext) {
        setDecryptedMessage(result.plaintext)
        // Start the auto-close timer
        setViewTimer(VIEW_TIMEOUT_SECONDS)

        // Update store - mark as read (this clears encrypted content)
        markAsRead(selectedNote.id)
        // Don't persist decrypted content - single view only

        // Send read receipt via Ghostr bot
        if (selectedNote.eventId) {
          sendReadReceipt(selectedNote.eventId, selectedNote.counterpartyPubkey)
        }
      } else {
        throw new Error(result.error || 'Decryption failed')
      }
    } catch (error) {
      console.error('[ReceivedGhostNotes] Decrypt failed:', error)
      toast({
        title: 'Decryption failed',
        description:
          error instanceof Error ? error.message : 'Could not decrypt message',
        variant: 'destructive',
      })
    } finally {
      setIsDecrypting(false)
    }
  }

  const handleCopyContent = async () => {
    if (!decryptedMessage) return

    try {
      await navigator.clipboard.writeText(decryptedMessage)
      setCopiedContent(true)
      setTimeout(() => setCopiedContent(false), 2000)
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      })
    }
  }

  const handleCloseReadDialog = useCallback(() => {
    setReadDialogOpen(false)
    setSelectedNote(null)
    setDecryptedMessage(null)
    setViewTimer(0)
  }, [])

  const getStatusIcon = (status: GhostNoteStatus) => {
    switch (status) {
      case 'active':
        return <Lock className="h-4 w-4 text-primary" />
      case 'read':
        return <Eye className="h-4 w-4 text-muted-foreground" />
      case 'revoked':
      case 'expired':
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  // Compact render for archived (read) notes - no sender info for privacy
  const renderArchivedNote = (note: GhostNote) => {
    return (
      <div
        key={note.id}
        className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded text-xs text-muted-foreground"
      >
        <div className="flex items-center gap-2">
          <Eye className="h-3 w-3" />
          <span>Viewed {formatTimeAgo(note.readAt || note.createdAt)}</span>
        </div>
        <span className="italic">Content deleted</span>
      </div>
    )
  }

  const renderNote = (note: GhostNote, canRead: boolean = true) => {
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
                  From: {profile?.name || formatPubkey(note.counterpartyPubkey)}
                </span>
                {getStatusIcon(note.status)}
              </div>

              <div className="text-xs text-muted-foreground mt-1">
                Received {formatTimeAgo(note.createdAt)}
              </div>

              {!isExpired && note.status !== 'expired' && note.status !== 'revoked' && (
                <div className="text-xs text-muted-foreground">
                  Expires: {formatExpirationDateTime(note.expiration)} (
                  {formatExpiration(note.expiration)})
                </div>
              )}

              {isExpired && note.status === 'active' && (
                <div className="text-xs text-destructive mt-1">
                  This note has expired
                </div>
              )}

              {canRead && note.status === 'active' && !isExpired && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handleReadClick(note)}
                  className="mt-3"
                >
                  <Eye className="h-3 w-3 mr-1.5" />
                  Read Secret
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <GhostNoteIcon className="h-5 w-5" />
          Received Ghost Notes
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Unread Notes */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
          <p>Loading Ghost Notes...</p>
        </div>
      ) : unreadNotes.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Unread ({unreadNotes.length})
          </h3>
          <div className="space-y-3">
            {unreadNotes.map((note) => renderNote(note))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <GhostNoteIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No unread Ghost Notes</p>
          <p className="text-sm mt-1">Check back later for new secrets</p>
        </div>
      )}

      {/* Read Notes - compact view without sender info */}
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

      {/* Expired/Revoked Notes */}
      {expiredNotes.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowExpired(!showExpired)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="h-4 w-4" />
            Expired/Revoked ({expiredNotes.length})
            {showExpired ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showExpired && (
            <div className="space-y-3 opacity-60">
              {expiredNotes.map((note) => renderNote(note, false))}
            </div>
          )}
        </div>
      )}

      {/* Read Dialog */}
      <Dialog open={readDialogOpen} onOpenChange={setReadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GhostNoteIcon className="h-5 w-5" />
              {decryptedMessage ? 'Secret Message' : 'Ghost Note'}
            </DialogTitle>
            <DialogDescription>
              {selectedNote && (
                <>
                  From:{' '}
                  {profileCache[selectedNote.counterpartyPubkey]?.name ||
                    formatPubkey(selectedNote.counterpartyPubkey)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {!decryptedMessage ? (
            // Pre-decrypt view
            <div className="space-y-4 py-4">
              <div className="text-sm space-y-2">
                <p>Ready to view this secret?</p>
                <ul className="text-muted-foreground text-xs space-y-1">
                  <li>• This message can only be viewed once</li>
                  <li>• You'll have {VIEW_TIMEOUT_SECONDS} seconds to view it</li>
                  <li>• The sender will be notified</li>
                </ul>
              </div>
            </div>
          ) : (
            // Decrypted view
            <div className="space-y-4 py-4">
              {/* Timer warning */}
              <div className={`text-xs text-center py-1.5 px-3 rounded ${
                viewTimer <= 10
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              }`}>
                <Clock className="h-3 w-3 inline mr-1.5" />
                Auto-close in {viewTimer}s
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{decryptedMessage}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            {!decryptedMessage ? (
              <>
                <Button variant="outline" onClick={handleCloseReadDialog}>
                  Cancel
                </Button>
                <Button onClick={handleDecrypt} disabled={isDecrypting}>
                  {isDecrypting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Decrypting...
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Read Now
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={handleCopyContent}>
                  {copiedContent ? (
                    <>
                      <Check className="h-4 w-4 mr-1.5 text-green-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-1.5" />
                      Copy Text
                    </>
                  )}
                </Button>
                <Button onClick={handleCloseReadDialog}>Close</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
