import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Lock, Eye, Clock, Loader2, Copy, Check, AlertCircle } from 'lucide-react'
import { GhostNoteIcon } from '@/components/common/GhostNoteIcon'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/stores/authStore'
import { useGhostNoteStore } from '@/stores/ghostNoteStore'
import { useUIStore } from '@/stores/uiStore'
import {
  fetchGhostNoteByDTag,
  readGhostNote,
  sendReadReceipt,
  formatExpiration,
  formatExpirationDateTime,
  isGhostNoteExpired,
} from '@/lib/nostr/ghostNote'
import { fetchProfile, getDisplayName } from '@/services/profileSearchService'
import { toast } from '@/hooks/useToast'
import type { GhostNote } from '@/types/ghostNote'
import { v4 as uuidv4 } from 'uuid'

export function GhostNoteViewer() {
  const { dTag } = useParams<{ dTag: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  const { setLoginModalOpen } = useUIStore()
  const { addGhostNote, getGhostNoteByDTag, markAsRead } = useGhostNoteStore()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ghostNote, setGhostNote] = useState<GhostNote | null>(null)
  const [senderProfile, setSenderProfile] = useState<{ name: string; picture?: string } | null>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [decryptedMessage, setDecryptedMessage] = useState<string | null>(null)
  const [copiedContent, setCopiedContent] = useState(false)
  const [viewTimer, setViewTimer] = useState<number>(0)

  const VIEW_TIMEOUT_SECONDS = 60

  // Ref for close handler to avoid stale closures
  const closeViewRef = useRef<() => void>(() => {
    setDecryptedMessage(null)
    setViewTimer(0)
  })

  // Auto-close timer
  useEffect(() => {
    if (decryptedMessage && viewTimer > 0) {
      const interval = setInterval(() => {
        setViewTimer((prev) => {
          if (prev <= 1) {
            closeViewRef.current()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [decryptedMessage, viewTimer])

  // Fetch ghost note when authenticated
  const fetchNote = useCallback(async () => {
    if (!dTag || !isAuthenticated || !user) return

    setIsLoading(true)
    setError(null)

    try {
      // Check if we already have this note in store
      const existingNote = getGhostNoteByDTag(dTag)
      if (existingNote) {
        setGhostNote(existingNote)
        // Fetch sender profile
        try {
          const profile = await fetchProfile(existingNote.counterpartyPubkey)
          if (profile) {
            setSenderProfile({
              name: getDisplayName(profile),
              picture: profile.picture,
            })
          }
        } catch {
          // Ignore profile fetch errors
        }
        setIsLoading(false)
        return
      }

      // Fetch from relay
      const event = await fetchGhostNoteByDTag(dTag)
      if (!event) {
        setError('Ghost Note not found. It may have been revoked or expired.')
        setIsLoading(false)
        return
      }

      // Extract data from event
      const expiration = parseInt(
        event.tags.find((t) => t[0] === 'expiration')?.[1] || '0'
      )

      if (isGhostNoteExpired(expiration)) {
        setError('This Ghost Note has expired and can no longer be read.')
        setIsLoading(false)
        return
      }

      // Create ghost note object
      const note: GhostNote = {
        id: uuidv4(),
        eventId: event.id,
        dTag,
        ownerPubkey: user.pubkey,
        direction: 'received',
        counterpartyPubkey: event.pubkey,
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

      // Add to store
      addGhostNote(note)
      setGhostNote(note)

      // Fetch sender profile
      try {
        const profile = await fetchProfile(event.pubkey)
        if (profile) {
          setSenderProfile({
            name: getDisplayName(profile),
            picture: profile.picture,
          })
        }
      } catch {
        // Ignore profile fetch errors
      }
    } catch (err) {
      console.error('[GhostNoteViewer] Fetch error:', err)
      setError('Failed to fetch Ghost Note. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dTag, isAuthenticated, user, getGhostNoteByDTag, addGhostNote])

  useEffect(() => {
    if (isAuthenticated && dTag) {
      fetchNote()
    } else if (!isAuthenticated) {
      setIsLoading(false)
    }
  }, [isAuthenticated, dTag, fetchNote])

  const handleDecrypt = async () => {
    if (!ghostNote) return

    // Check if already read
    if (ghostNote.status !== 'active') {
      setError('This message has already been viewed.')
      return
    }

    // Check expiration
    if (isGhostNoteExpired(ghostNote.expiration)) {
      setError('This Ghost Note has expired.')
      return
    }

    setIsDecrypting(true)
    try {
      const result = await readGhostNote(
        ghostNote.eventId || '',
        ghostNote.encryptedContent,
        ghostNote.counterpartyPubkey
      )

      if (result.success && result.plaintext) {
        setDecryptedMessage(result.plaintext)
        setViewTimer(VIEW_TIMEOUT_SECONDS)

        // Mark as read
        markAsRead(ghostNote.id)

        // Send read receipt via Ghostr bot
        if (ghostNote.eventId) {
          sendReadReceipt(ghostNote.eventId, ghostNote.counterpartyPubkey)
        }
      } else {
        throw new Error(result.error || 'Decryption failed')
      }
    } catch (err) {
      console.error('[GhostNoteViewer] Decrypt error:', err)
      toast({
        title: 'Decryption failed',
        description: err instanceof Error ? err.message : 'Could not decrypt message',
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

  // Not authenticated - show login prompt
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <GhostNoteIcon className="h-16 w-16 mx-auto opacity-70" />
            <h1 className="text-xl font-semibold">Ghost Note</h1>
            <p className="text-muted-foreground">
              You've received an encrypted secret message. Login with your Nostr
              identity to decrypt and view it.
            </p>
            <Button onClick={() => setLoginModalOpen(true)}>
              <Lock className="h-4 w-4 mr-2" />
              Login to View
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin opacity-50" />
            <p className="text-muted-foreground">Loading Ghost Note...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-destructive opacity-70" />
            <h1 className="text-xl font-semibold">Unable to Load</h1>
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => navigate('/ghost-notes')}>
              Go to Ghost Notes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // No note found
  if (!ghostNote) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <GhostNoteIcon className="h-12 w-12 mx-auto opacity-50" />
            <h1 className="text-xl font-semibold">Not Found</h1>
            <p className="text-muted-foreground">
              This Ghost Note could not be found. It may have been revoked or expired.
            </p>
            <Button variant="outline" onClick={() => navigate('/ghost-notes')}>
              Go to Ghost Notes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Already read
  if (ghostNote.status !== 'active' && !decryptedMessage) {
    return (
      <div className="max-w-md mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <Eye className="h-12 w-12 mx-auto text-muted-foreground opacity-70" />
            <h1 className="text-xl font-semibold">Already Viewed</h1>
            <p className="text-muted-foreground">
              This Ghost Note has already been viewed. For security, messages can
              only be read once.
            </p>
            <Button variant="outline" onClick={() => navigate('/ghost-notes')}>
              Go to Ghost Notes
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isExpired = isGhostNoteExpired(ghostNote.expiration)

  return (
    <div className="max-w-md mx-auto py-8">
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <GhostNoteIcon className="h-12 w-12 mx-auto" />
            <h1 className="text-xl font-semibold">
              {decryptedMessage ? 'Secret Message' : 'Ghost Note'}
            </h1>
          </div>

          {/* Sender info */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <img
              src={
                senderProfile?.picture ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${ghostNote.counterpartyPubkey}`
              }
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                From: {senderProfile?.name || formatPubkey(ghostNote.counterpartyPubkey)}
              </div>
              <div className="text-xs text-muted-foreground">
                Sent {formatTimeAgo(ghostNote.createdAt)}
              </div>
            </div>
          </div>

          {!decryptedMessage ? (
            // Pre-decrypt view
            <>
              {isExpired ? (
                <div className="text-center py-4">
                  <Clock className="h-8 w-8 mx-auto text-destructive mb-2" />
                  <p className="text-destructive">This Ghost Note has expired</p>
                </div>
              ) : (
                <>
                  <div className="text-sm space-y-2 text-center">
                    <p className="text-muted-foreground">
                      Expires: {formatExpirationDateTime(ghostNote.expiration)} (
                      {formatExpiration(ghostNote.expiration)})
                    </p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>This message can only be viewed once</p>
                      <p>You'll have {VIEW_TIMEOUT_SECONDS} seconds to view it</p>
                      <p>The sender will be notified</p>
                    </div>
                  </div>

                  <Button
                    onClick={handleDecrypt}
                    disabled={isDecrypting}
                    className="w-full"
                  >
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
              )}
            </>
          ) : (
            // Decrypted view
            <>
              {/* Timer warning */}
              <div
                className={`text-xs text-center py-1.5 px-3 rounded ${
                  viewTimer <= 10
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Clock className="h-3 w-3 inline mr-1.5" />
                Auto-close in {viewTimer}s
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{decryptedMessage}</p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleCopyContent}
                  className="flex-1"
                >
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
                <Button onClick={() => navigate('/ghost-notes')} className="flex-1">
                  Done
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
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
