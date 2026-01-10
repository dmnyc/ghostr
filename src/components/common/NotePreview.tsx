import { useMemo, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { extractImageUrls } from '@/lib/blossom'
import { type SearchProfile } from '@/services/profileSearchService'
import { nip19 } from 'nostr-tools'
import { useProfileQueries } from '@/hooks/queries/useProfileQuery'

// Extract all nostr:npub mentions from content
function extractNpubMentions(content: string): string[] {
  const regex = /nostr:(npub1[a-zA-Z0-9]{58})/g
  const matches: string[] = []
  let match
  while ((match = regex.exec(content)) !== null) {
    const npub = match[1]
    if (npub && !matches.includes(npub)) {
      matches.push(npub)
    }
  }
  return matches
}

// Hook to fetch profiles for npub mentions using React Query
// Benefits: automatic caching, deduplication, background updates
function useMentionProfiles(content: string) {
  const npubs = useMemo(() => extractNpubMentions(content), [content])

  // Convert npubs to pubkeys
  const pubkeys = useMemo(() => {
    return npubs
      .map((npub) => {
        try {
          const decoded = nip19.decode(npub)
          return decoded.type === 'npub' ? decoded.data : null
        } catch {
          return null
        }
      })
      .filter((p): p is string => p !== null)
  }, [npubs])

  // Use React Query to fetch all profiles in parallel with automatic deduplication
  const { profiles: profilesArray, isLoading: loading } = useProfileQueries(pubkeys)

  // Convert back to Map<npub, profile> for rendering
  const profiles = useMemo(() => {
    const map = new Map<string, SearchProfile>()
    profilesArray.forEach((profile) => {
      // Find the npub that corresponds to this profile
      const npub = npubs.find((n) => {
        try {
          const decoded = nip19.decode(n)
          return decoded.type === 'npub' && decoded.data === profile.pubkey
        } catch {
          return false
        }
      })
      if (npub) {
        map.set(npub, profile)
      }
    })
    return map
  }, [profilesArray, npubs])

  return { profiles, loading, hasMentions: npubs.length > 0 }
}

// Render content with mentions replaced by profile names
function ContentWithMentions({ content, profiles }: { content: string; profiles: Map<string, SearchProfile> }) {
  // Remove image URLs from the display text
  const imageUrls = extractImageUrls(content)
  let displayText = content
  imageUrls.forEach((url) => {
    displayText = displayText.replace(url, '').trim()
  })

  // Replace nostr:npub mentions with profile names
  const parts: ReactNode[] = []
  const regex = /nostr:(npub1[a-zA-Z0-9]{58})/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(displayText)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(displayText.slice(lastIndex, match.index))
    }

    // Add the mention
    const npub = match[1]
    if (npub) {
      const profile = profiles.get(npub)
      const displayName = profile?.displayName || profile?.name || `${npub.slice(0, 12)}...`

      parts.push(
        <span
          key={match.index}
          className="text-primary font-medium"
        >
          @{displayName}
        </span>
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < displayText.length) {
    parts.push(displayText.slice(lastIndex))
  }

  if (parts.length === 0 || displayText.trim() === '') {
    return null
  }

  return (
    <div className="text-sm whitespace-pre-wrap break-words">
      {parts}
    </div>
  )
}

interface NotePreviewProps {
  content: string
  className?: string
}

export function NotePreview({ content, className }: NotePreviewProps) {
  const imageUrls = useMemo(() => extractImageUrls(content), [content])
  const { profiles, hasMentions } = useMentionProfiles(content)

  const hasContent = imageUrls.length > 0 || hasMentions

  if (!hasContent) {
    return null
  }

  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground font-medium mb-2">Preview</div>
      <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
        {/* Text content with rendered mentions */}
        {hasMentions && (
          <ContentWithMentions content={content} profiles={profiles} />
        )}

        {/* Image grid */}
        {imageUrls.length > 0 && (
          <div className="grid gap-2" style={{
            gridTemplateColumns: imageUrls.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))'
          }}>
            {imageUrls.map((url, index) => (
              <ImagePreview key={`${url}-${index}`} url={url} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ImagePreviewProps {
  url: string
}

function ImagePreview({ url }: ImagePreviewProps) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (error) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center text-sm text-muted-foreground">
        Failed to load image
      </div>
    )
  }

  return (
    <div className="relative rounded-lg overflow-hidden border bg-muted/30">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        src={url}
        alt=""
        className={`w-full h-auto object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  )
}

interface NotePreviewWithRemoveProps {
  content: string
  onRemoveImage: (url: string) => void
  className?: string
}

export function NotePreviewWithRemove({ content, onRemoveImage, className }: NotePreviewWithRemoveProps) {
  const imageUrls = useMemo(() => extractImageUrls(content), [content])
  const { profiles, hasMentions } = useMentionProfiles(content)

  const hasContent = imageUrls.length > 0 || hasMentions

  if (!hasContent) {
    return null
  }

  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground font-medium mb-2">Preview</div>
      <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
        {/* Text content with rendered mentions */}
        {hasMentions && (
          <ContentWithMentions content={content} profiles={profiles} />
        )}

        {/* Image grid */}
        {imageUrls.length > 0 && (
          <div className="grid gap-2" style={{
            gridTemplateColumns: imageUrls.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))'
          }}>
            {imageUrls.map((url, index) => (
              <ImagePreviewWithRemove
                key={`${url}-${index}`}
                url={url}
                onRemove={() => onRemoveImage(url)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ImagePreviewWithRemoveProps {
  url: string
  onRemove: () => void
}

function ImagePreviewWithRemove({ url, onRemove }: ImagePreviewWithRemoveProps) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (error) {
    return (
      <div className="relative rounded-lg border bg-muted/30 p-4 flex items-center justify-center text-sm text-muted-foreground">
        Failed to load image
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          title="Remove image"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative rounded-lg overflow-hidden border bg-muted/30 group">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        src={url}
        alt=""
        className={`w-full h-auto object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove image"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
