import { useState, useEffect } from 'react'
import { Send, Loader2, Copy, Check, X } from 'lucide-react'
import { GhostNoteIcon } from '@/components/common/GhostNoteIcon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ProfileSearchInput } from '@/components/common/ProfileSearchInput'
import { useAuthStore, npubToPubkey } from '@/stores/authStore'
import { useGhostNoteStore } from '@/stores/ghostNoteStore'
import { createGhostNote } from '@/lib/nostr/ghostNote'
import {
  getDisplayName,
  formatNpub,
  type SearchProfile,
} from '@/services/profileSearchService'
import { toast } from '@/hooks/useToast'
import { EXPIRATION_OPTIONS, DEFAULT_EXPIRATION_SECONDS } from '@/types/ghostNote'

const MAX_CONTENT_LENGTH = 500

interface GhostNoteComposeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialRecipient?: SearchProfile
}

export function GhostNoteCompose({
  open,
  onOpenChange,
  initialRecipient,
}: GhostNoteComposeProps) {
  const { user } = useAuthStore()
  const { addGhostNote, settings } = useGhostNoteStore()

  const [recipientNpub, setRecipientNpub] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<SearchProfile | null>(
    null
  )
  const [content, setContent] = useState('')
  const [expirationSeconds, setExpirationSeconds] = useState(
    settings.defaultExpiration || DEFAULT_EXPIRATION_SECONDS
  )
  const [isSending, setIsSending] = useState(false)

  // Success state
  const [showSuccess, setShowSuccess] = useState(false)
  const [successLink, setSuccessLink] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setContent('')
      setIsSending(false)
      setShowSuccess(false)
      setSuccessLink('')
      setCopiedLink(false)

      if (initialRecipient) {
        setSelectedProfile(initialRecipient)
        setRecipientNpub(initialRecipient.npub)
      } else {
        setSelectedProfile(null)
        setRecipientNpub('')
      }
    }
  }, [open, initialRecipient])

  const handleProfileSelect = (profile: SearchProfile) => {
    setSelectedProfile(profile)
    setRecipientNpub(profile.npub)
  }

  const handleClearSelection = () => {
    setSelectedProfile(null)
    setRecipientNpub('')
  }

  const handleSend = async () => {
    if (!user) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to send Ghost Notes',
        variant: 'destructive',
      })
      return
    }

    if (!selectedProfile) {
      toast({
        title: 'No recipient',
        description: 'Please select a recipient',
        variant: 'destructive',
      })
      return
    }

    if (!content.trim()) {
      toast({
        title: 'Empty message',
        description: 'Please enter a message',
        variant: 'destructive',
      })
      return
    }

    setIsSending(true)

    try {
      const recipientPubkey = npubToPubkey(selectedProfile.npub)

      if (!recipientPubkey) {
        throw new Error('Invalid recipient')
      }

      const result = await createGhostNote({
        recipientPubkey,
        content: content.trim(),
        expirationSeconds,
        notifyOnRead: true, // Always notify sender when read
      })

      if (result.success && result.ghostNote) {
        // Save to store
        addGhostNote(result.ghostNote)

        // Show success
        setSuccessLink(result.link || '')
        setShowSuccess(true)

        toast({
          title: 'Ghost Note sent',
          description: `Sent to ${getDisplayName(selectedProfile)}`,
        })
      } else {
        throw new Error(result.error || 'Failed to send Ghost Note')
      }
    } catch (error) {
      console.error('[GhostNoteCompose] Send failed:', error)
      toast({
        title: 'Failed to send',
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(successLink)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      })
    }
  }

  const handleSendAnother = () => {
    setShowSuccess(false)
    setContent('')
    setSuccessLink('')
    setCopiedLink(false)
  }

  const handleClose = () => {
    onOpenChange(false)
  }

  const getExpirationLabel = (seconds: number): string => {
    const option = EXPIRATION_OPTIONS.find((o) => o.seconds === seconds)
    return option?.label || `${Math.floor(seconds / 3600)} hours`
  }

  const remainingChars = MAX_CONTENT_LENGTH - content.length
  const isOverLimit = remainingChars < 0

  // Success view
  if (showSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" />
              Ghost Note Sent
            </DialogTitle>
            <DialogDescription>
              Your Ghost Note was sent to{' '}
              {selectedProfile ? getDisplayName(selectedProfile) : 'recipient'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {successLink && (
              <div className="space-y-2">
                <Label>Shareable Link</Label>
                <div className="flex gap-2">
                  <code className="flex-1 text-xs bg-muted p-2 rounded break-all overflow-hidden">
                    {successLink}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    className="flex-shrink-0"
                  >
                    {copiedLink ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            <div className="text-sm text-muted-foreground">
              <p>
                Self-destructs in: <strong>{getExpirationLabel(expirationSeconds)}</strong>
              </p>
              <p className="mt-1">You'll be notified when it's read</p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={handleSendAnother}>
              Send Another
            </Button>
            <Button onClick={handleClose}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Compose view
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GhostNoteIcon className="h-5 w-5" />
            New Ghost Note
          </DialogTitle>
          <DialogDescription>
            Send an encrypted, self-destructing secret message
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recipient */}
          <div className="space-y-2">
            <Label>To</Label>
            {selectedProfile ? (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                <img
                  src={
                    selectedProfile.picture ||
                    `https://api.dicebear.com/7.x/identicon/svg?seed=${selectedProfile.pubkey}`
                  }
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {getDisplayName(selectedProfile)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatNpub(selectedProfile.npub)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearSelection}
                  className="h-8 w-8 flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <ProfileSearchInput
                value={recipientNpub}
                onChange={setRecipientNpub}
                onSelect={handleProfileSelect}
                placeholder="Search by name, npub, or nip05..."
              />
            )}
          </div>

          {/* Message */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Secret Message</Label>
              <span
                className={`text-xs ${
                  isOverLimit
                    ? 'text-destructive'
                    : remainingChars < 50
                      ? 'text-yellow-500'
                      : 'text-muted-foreground'
                }`}
              >
                {remainingChars}
              </span>
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your secret message..."
              rows={4}
              className="resize-none"
              maxLength={MAX_CONTENT_LENGTH + 50} // Allow some overage for visual feedback
            />
          </div>

          {/* Expiration */}
          <div className="space-y-3">
            <Label>Auto-delete after</Label>
            <RadioGroup
              value={expirationSeconds.toString()}
              onValueChange={(value) => setExpirationSeconds(parseInt(value))}
              className="grid grid-cols-2 gap-2"
            >
              {EXPIRATION_OPTIONS.map((option) => (
                <div key={option.seconds} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={option.seconds.toString()}
                    id={`exp-${option.seconds}`}
                  />
                  <Label
                    htmlFor={`exp-${option.seconds}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {option.label}
                    {'default' in option && option.default && (
                      <span className="text-muted-foreground ml-1">
                        (recommended)
                      </span>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <p className="text-xs text-muted-foreground">
            You'll be notified when the recipient reads this message. You can manually revoke access anytime before expiration.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              isSending || !selectedProfile || !content.trim() || isOverLimit
            }
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Ghost Note
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
