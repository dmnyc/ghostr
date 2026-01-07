import { useState, useEffect } from 'react'
import { Send, Loader2, AlertCircle, X, User } from 'lucide-react'
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
import { ProfileSearchInput } from '@/components/common/ProfileSearchInput'
import { useDraftStore } from '@/stores/draftStore'
import { useFavoritesStore } from '@/stores/favoritesStore'
import { npubToPubkey } from '@/stores/authStore'
import { sendGiftWrappedSubmission } from '@/lib/nostr/nip59'
import { getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'
import type { SubmissionPayload } from '@/types/submission'
import type { Draft } from '@/types/draft'
import { toast } from '@/hooks/useToast'
import { PROTOCOL_VERSION } from '@/lib/constants'
import { v4 as uuid } from 'uuid'

interface SubmitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: Draft
}

export function SubmitDialog({ open, onOpenChange, draft }: SubmitDialogProps) {
  const { markAsSubmitted, saveDrafts } = useDraftStore()
  const { favorites, isLoaded, loadFavorites, addFavorite, removeFavorite, isFavorite } =
    useFavoritesStore()

  const [publisherNpub, setPublisherNpub] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<SearchProfile | null>(null)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load favorites when dialog opens
  useEffect(() => {
    if (open && !isLoaded) {
      loadFavorites()
    }
  }, [open, isLoaded, loadFavorites])

  // Pre-populate with draft's selected publisher
  useEffect(() => {
    if (open && draft.targetPublisher && !selectedProfile) {
      const publisher = draft.targetPublisher
      setSelectedProfile({
        pubkey: publisher.pubkey,
        npub: publisher.npub,
        name: publisher.name,
        displayName: publisher.displayName,
        picture: publisher.picture,
        nip05: publisher.nip05,
      })
      setPublisherNpub(publisher.npub)
    }
  }, [open, draft.targetPublisher, selectedProfile])

  const handleProfileSelect = (profile: SearchProfile) => {
    setSelectedProfile(profile)
    setPublisherNpub(profile.npub)
    setError(null)
  }

  const handleClearSelection = () => {
    setSelectedProfile(null)
    setPublisherNpub('')
  }

  const handleToggleFavorite = async (profile: SearchProfile) => {
    try {
      if (isFavorite(profile.pubkey)) {
        await removeFavorite(profile.pubkey)
        toast({
          title: 'Removed from favorites',
          description: `${getDisplayName(profile)} removed from favorites`,
        })
      } else {
        await addFavorite(profile)
        toast({
          title: 'Added to favorites',
          description: `${getDisplayName(profile)} added to favorites`,
        })
      }
    } catch (err) {
      console.error('Failed to update favorites:', err)
      toast({
        title: 'Failed to update favorites',
        description: 'Please try again',
        variant: 'destructive',
      })
    }
  }

  const handleSubmit = async () => {
    setError(null)

    if (!publisherNpub.trim()) {
      setError("Please select or enter the publisher's npub")
      return
    }

    let publisherPubkey: string
    try {
      publisherPubkey = npubToPubkey(publisherNpub.trim())
    } catch {
      setError('Invalid npub format. It should start with "npub1"')
      return
    }

    setIsSubmitting(true)

    try {
      // Build tags array, including cover image if present
      const tags = [...draft.tags]
      if (draft.targetKind === 30023 && draft.coverImage) {
        // Add image tag for long-form articles with cover image
        tags.push(['image', draft.coverImage])
      }

      // Generate unique submission ID for each submission
      // This allows resubmissions after rejection (publisher tracks by submission ID)
      const submissionId = uuid()

      const payload: SubmissionPayload = {
        protocol: PROTOCOL_VERSION,
        type: 'submission',
        id: submissionId,
        content: draft.content,
        kind: draft.targetKind,
        tags,
        note: note.trim(),
      }

      await sendGiftWrappedSubmission(publisherPubkey, payload)

      markAsSubmitted(draft.id, publisherNpub.trim())
      await saveDrafts()

      toast({
        title: 'Submission sent',
        description: 'Your draft has been sent to the publisher for review.',
      })

      onOpenChange(false)
      setPublisherNpub('')
      setSelectedProfile(null)
      setNote('')
    } catch (err) {
      console.error('Failed to submit:', err)
      setError(err instanceof Error ? err.message : 'Failed to send submission')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Convert favorites to SearchProfile format
  const favoriteProfiles: SearchProfile[] = favorites.map((f) => ({
    pubkey: f.pubkey,
    npub: f.npub,
    name: f.name,
    displayName: f.displayName,
    picture: f.picture,
    nip05: f.nip05,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for Review</DialogTitle>
          <DialogDescription>
            Send this draft to a publisher for review and publishing. The content will be encrypted
            and only the publisher can read it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Publisher</Label>

            {selectedProfile ? (
              <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
                {selectedProfile.picture ? (
                  <img
                    src={selectedProfile.picture}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {getDisplayName(selectedProfile)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {selectedProfile.nip05 || formatNpub(selectedProfile.pubkey)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={handleClearSelection}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <ProfileSearchInput
                value={publisherNpub}
                onChange={setPublisherNpub}
                onSelect={handleProfileSelect}
                placeholder="Search by name or paste npub..."
                favorites={favoriteProfiles}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={isFavorite}
              />
            )}

            <p className="text-xs text-muted-foreground">
              Search for a publisher by name, or paste their npub directly.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Note to Publisher (optional)</Label>
            <Textarea
              id="note"
              placeholder="Any notes for the reviewer..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? 'Sending...' : 'Send for Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
