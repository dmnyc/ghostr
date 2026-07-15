/**
 * Single source of truth for parsing nostr bech32 entities (npub / nprofile /
 * note / nevent / naddr) and classifying media URLs.
 *
 * Every editor and preview surface imports from here so there is exactly one
 * regex and one decode path. Previously the codebase had four divergent
 * `nostr:` regexes (only one of which matched `nprofile`; none matched
 * note/nevent/naddr) — see the plan for the hazards that caused.
 *
 * Bounds mirror the sidecar extension's tokenizer: npub1/note1 are always
 * exactly 58 data chars, the variable-length TLV forms (nprofile/nevent/naddr)
 * use {50,}. The lowercase bech32 charset prevents greedy matches from
 * swallowing adjacent words.
 */
import { nip19 } from 'nostr-tools'

export type NostrEntityType = 'npub' | 'nprofile' | 'note' | 'nevent' | 'naddr'

export interface DecodedEntity {
  /** Entity type */
  type: NostrEntityType
  /** Bech32 string without the `nostr:` prefix, e.g. `npub1...` */
  raw: string
  /** Canonical URI form, e.g. `nostr:npub1...` */
  uri: string
  /** Hex pubkey (npub / nprofile / naddr.author / nevent.author) */
  pubkey?: string
  /** Hex event id (note / nevent) */
  id?: string
  /** Relay hints (nprofile / nevent / naddr) */
  relays?: string[]
  /** Kind (naddr / nevent) */
  kind?: number
  /** `d` tag identifier (naddr) */
  identifier?: string
}

/**
 * Matches a nostr bech32 entity, with an optional `nostr:` prefix.
 * Capture group 1 = the bech32 string (no prefix).
 * Module-level and stateful (`g` flag) — always reset `.lastIndex = 0` before use.
 */
export const NOSTR_ENTITY_PATTERN =
  '(?:nostr:)?(npub1[0-9a-z]{58}|nprofile1[0-9a-z]{50,}|note1[0-9a-z]{58}|nevent1[0-9a-z]{50,}|naddr1[0-9a-z]{50,})'
export const NOSTR_ENTITY_RE = new RegExp(NOSTR_ENTITY_PATTERN, 'gi')

/** Combined preview tokenizer: a URL token OR a nostr entity (optional `nostr:` prefix).
 *  URL char class allows balanced (...) groups so links like Wikipedia's
 *  /wiki/Foo_(bar) survive, while still stopping at stray sentence `)`. */
export const PREVIEW_TOKEN_RE =
  /(https?:\/\/(?:[^\s()]|\([^\s()]*\))+)|(?:nostr:)?(npub1[0-9a-z]{58}|nprofile1[0-9a-z]{50,}|note1[0-9a-z]{58}|nevent1[0-9a-z]{50,}|naddr1[0-9a-z]{50,})/gi

const IMG_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i
const VID_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i

export function isImageUrl(url: string): boolean {
  return IMG_EXT.test(url)
}

export function isVideoUrl(url: string): boolean {
  return VID_EXT.test(url)
}

/**
 * Decode a bech32 token (with or without `nostr:` prefix) into a structured
 * entity. Returns null on anything that isn't a recognized entity (never throws).
 */
export function decodeNostrEntity(token: string): DecodedEntity | null {
  const bech32 = token.startsWith('nostr:') ? token.slice(6) : token
  try {
    const decoded = nip19.decode(bech32)
    const base = { raw: bech32, uri: `nostr:${bech32}` }

    switch (decoded.type) {
      case 'npub':
        return { ...base, type: 'npub', pubkey: decoded.data }
      case 'nprofile':
        return { ...base, type: 'nprofile', pubkey: decoded.data.pubkey, relays: decoded.data.relays }
      case 'note':
        return { ...base, type: 'note', id: decoded.data }
      case 'nevent':
        return {
          ...base,
          type: 'nevent',
          id: decoded.data.id,
          relays: decoded.data.relays,
          pubkey: decoded.data.author,
          kind: decoded.data.kind,
        }
      case 'naddr':
        return {
          ...base,
          type: 'naddr',
          identifier: decoded.data.identifier,
          pubkey: decoded.data.pubkey,
          relays: decoded.data.relays,
          kind: decoded.data.kind,
        }
      default:
        return null
    }
  } catch {
    return null
  }
}

/** Extract every nostr entity from a string, in order of appearance. */
export function extractNostrEntities(text: string): DecodedEntity[] {
  const results: DecodedEntity[] = []
  NOSTR_ENTITY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = NOSTR_ENTITY_RE.exec(text)) !== null) {
    const decoded = match[1] ? decodeNostrEntity(match[1]) : null
    if (decoded) results.push(decoded)
  }
  return results
}

/** True if the text contains at least one nostr entity. */
export function containsNostrEntity(text: string): boolean {
  NOSTR_ENTITY_RE.lastIndex = 0
  return NOSTR_ENTITY_RE.test(text)
}

/**
 * Deduplicated hex pubkeys referenced by npub/nprofile mentions in the text.
 * Used to batch-fetch profiles for pill labels and previews.
 */
export function extractMentionedPubkeys(text: string): string[] {
  const pubkeys = new Set<string>()
  for (const entity of extractNostrEntities(text)) {
    if ((entity.type === 'npub' || entity.type === 'nprofile') && entity.pubkey) {
      pubkeys.add(entity.pubkey)
    }
  }
  return [...pubkeys]
}

/** Short, safe label for an entity whose profile has not resolved yet. */
export function fallbackEntityLabel(entity: DecodedEntity): string {
  const short = entity.raw.length > 12 ? `${entity.raw.slice(0, 10)}…` : entity.raw
  return `@${short}`
}

export type PreviewTokenType = 'text' | 'url' | 'nostr'

export interface PreviewToken {
  type: PreviewTokenType
  /** Present for `text` and as raw fallback for `nostr` */
  text?: string
  /** Present for `url` */
  url?: string
  /** Present for `nostr` (null if it failed to decode) */
  entity?: DecodedEntity
}

/** Split text into text/url/nostr tokens for rich rendering (mirrors sidecar's PREVIEW_RE). */
export function tokenizeForPreview(text: string): PreviewToken[] {
  const tokens: PreviewToken[] = []
  let last = 0
  PREVIEW_TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PREVIEW_TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push({ type: 'text', text: text.slice(last, match.index) })
    }
    if (match[1]) {
      tokens.push({ type: 'url', url: match[1] })
    } else if (match[2]) {
      tokens.push({ type: 'nostr', entity: match[2] ? (decodeNostrEntity(match[2]) ?? undefined) : undefined, text: match[0] })
    }
    last = match.index + match[0].length
  }
  if (last < text.length) {
    tokens.push({ type: 'text', text: text.slice(last) })
  }
  return tokens
}
