import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { NDKFilter } from '@nostr-dev-kit/ndk'
import { useNDKStore } from '@/stores/ndkStore'
import { useProfileQuery } from '@/hooks/queries/useProfileQuery'
import { getDisplayName, formatNpub } from '@/services/profileSearchService'
import {
  tokenizeForPreview,
  isImageUrl,
  isVideoUrl,
  NOSTR_ENTITY_RE,
  type DecodedEntity,
} from '@/lib/nostrEntities'
import { cn } from '@/lib/utils/cn'

const PILL_CLASS =
  'inline-flex items-center bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-medium align-baseline'
const EMBED_TIMEOUT_MS = 6000

/**
 * Truncate to ~max chars without splitting a nostr token. Cuts at the nearest
 * word boundary and appends an ellipsis. Used by list/card previews so a long
 * article doesn't tokenize/fetch in full.
 */
function truncateText(content: string, max: number): string {
  if (content.length <= max) return content
  NOSTR_ENTITY_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NOSTR_ENTITY_RE.exec(content)) !== null) {
    if (max > m.index && max < m.index + m[0].length) {
      return content.slice(0, m.index).replace(/\s+\S*$/, '').trimEnd() + '…'
    }
  }
  return content.slice(0, max).replace(/\s+\S*$/, '').trimEnd() + '…'
}

/** Build an NDK filter for a note/nevent/naddr entity, or null if undecodable. */
function embedFilter(entity: DecodedEntity): NDKFilter | null {
  if (entity.type === 'note' && entity.id) return { ids: [entity.id] }
  if (entity.type === 'nevent' && entity.id) return { ids: [entity.id] }
  if (entity.type === 'naddr' && entity.pubkey && entity.identifier && entity.kind) {
    return { kinds: [entity.kind], authors: [entity.pubkey], '#d': [entity.identifier] }
  }
  return null
}

function MentionChip({ pubkey }: { pubkey: string }) {
  const { data: profile } = useProfileQuery(pubkey)
  const label = profile ? `@${getDisplayName(profile)}` : `@${formatNpub(pubkey)}`
  return <span className={PILL_CLASS}>{label}</span>
}

function PreviewImage({ url, compact }: { url: string; compact?: boolean }) {
  const [status, setStatus] = useState<'loading' | 'error' | 'loaded'>('loading')
  if (status === 'error') {
    return (
      <span className="inline-block rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground align-middle">
        failed image
      </span>
    )
  }
  return (
    <span className="inline-block my-1 align-middle">
      {status === 'loading' && (
        <span
          className={cn(
            'flex items-center justify-center rounded-md border bg-muted/30',
            compact ? 'h-8 w-12' : 'h-16 w-24',
          )}
        >
          <Loader2
            className={cn(
              'animate-spin text-muted-foreground',
              compact ? 'h-3 w-3' : 'h-4 w-4',
            )}
          />
        </span>
      )}
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={cn(
          'rounded-md border',
          compact ? 'max-h-12 w-auto' : 'max-w-full h-auto',
          status === 'loaded' ? 'inline-block' : 'hidden',
        )}
      />
    </span>
  )
}

/** Compact external link fallback for a nostr entity that couldn't be embedded. */
function EmbedLink({ entity }: { entity: DecodedEntity }) {
  const label =
    entity.type === 'naddr' ? 'article' : entity.type === 'note' ? 'note' : 'event'
  return (
    <a
      href={`https://njump.me/${entity.raw}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs text-primary hover:underline align-middle"
    >
      ↗ {label}
    </a>
  )
}

function NostrEmbed({ entity, depth }: { entity: DecodedEntity; depth: number }) {
  const ndk = useNDKStore((s) => s.ndk)
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'notfound' }
    | { status: 'found'; content: string; pubkey: string }
  >({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    const filter = embedFilter(entity)
    if (!ndk || !filter) {
      setState({ status: 'notfound' })
      return
    }
    setState({ status: 'loading' })

    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), EMBED_TIMEOUT_MS),
    )
    Promise.race([ndk.fetchEvent(filter), timeout])
      .then((event) => {
        if (cancelled) return
        if (event && event.content) {
          setState({ status: 'found', content: event.content, pubkey: event.pubkey })
        } else {
          setState({ status: 'notfound' })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'notfound' })
      })

    return () => {
      cancelled = true
    }
  }, [ndk, entity.uri])

  if (state.status === 'notfound') {
    return <EmbedLink entity={entity} />
  }

  return (
    <div className="my-1 rounded-md border bg-muted/20 p-2 text-xs">
      {state.status === 'loading' ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading nostr event…
        </span>
      ) : (
        <>
          <div className="mb-1 flex items-center gap-1 text-muted-foreground">
            <MentionChip pubkey={state.pubkey} />
          </div>
          <RichNotePreview content={state.content} depth={depth + 1} className="text-foreground/90" />
        </>
      )}
    </div>
  )
}

export interface RichNotePreviewProps {
  content: string
  className?: string
  /**
   * Recursion depth. At depth >= 1, note/nevent/naddr tokens render as compact
   * links instead of embeds, bounding recursion (an embedded note's own embeds
   * don't expand further).
   */
  depth?: number
  /** Compact mode: smaller media and embeds render as links (no relay fetches).
   *  Use in list/card rows. */
  compact?: boolean
  /** Truncate the content to ~this many chars (at a token-safe boundary) before
   *  rendering. For list/card previews of long articles. */
  maxLength?: number
}

/**
 * Rich read-only renderer for note content: tokenizes into text / url / nostr
 * and renders inline media, resolved @name mention chips, plain links, and
 * nostr embed cards (note/nevent/naddr). Mirrors sidecar's renderNotePreview.
 */
export function RichNotePreview({
  content,
  className,
  depth = 0,
  compact = false,
  maxLength,
}: RichNotePreviewProps) {
  const displayContent = maxLength ? truncateText(content, maxLength) : content
  const tokens = useMemo(() => tokenizeForPreview(displayContent), [displayContent])
  const effectiveDepth = compact ? Math.max(depth, 1) : depth

  if (tokens.length === 0) return null

  return (
    <div className={cn('whitespace-pre-wrap break-words', className)}>
      {tokens.map((token, i) => {
        if (token.type === 'text') {
          return <span key={i}>{token.text}</span>
        }
        if (token.type === 'url' && token.url) {
          const url = token.url.replace(/[.,;:!?]+$/, '')
          if (isImageUrl(url)) return <PreviewImage key={i} url={url} compact={compact} />
          if (isVideoUrl(url)) {
            return (
              <video
                key={i}
                src={url}
                controls
                className={cn(
                  'my-1 rounded-md border',
                  compact ? 'max-h-12 w-auto' : 'max-w-full',
                )}
              />
            )
          }
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline break-all"
            >
              {url}
            </a>
          )
        }
        // nostr token
        const entity = token.entity
        if (!entity) return <span key={i}>{token.text}</span>
        if (entity.type === 'npub' || entity.type === 'nprofile') {
          return entity.pubkey ? (
            <MentionChip key={i} pubkey={entity.pubkey} />
          ) : (
            <span key={i}>{token.text}</span>
          )
        }
        // note / nevent / naddr
        if (effectiveDepth >= 1) return <EmbedLink key={i} entity={entity} />
        return <NostrEmbed key={i} entity={entity} depth={effectiveDepth} />
      })}
    </div>
  )
}
