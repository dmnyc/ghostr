import React from 'react'
import { getDisplayName, type SearchProfile } from '@/services/profileSearchService'
import { NOSTR_ENTITY_RE, decodeNostrEntity, fallbackEntityLabel, type DecodedEntity } from '@/lib/nostrEntities'

/**
 * Renders text with nostr:npub mentions replaced by visual pills
 * Pills show the profile name/username and are atomic (deleted as a unit)
 */
/**
 * Converts plain text with newlines to React nodes with <br> tags
 */
function textWithLineBreaks(text: string, keyPrefix: string = ''): React.ReactNode[] {
  // Split by newlines but preserve the structure
  const parts = text.split('\n')
  const nodes: React.ReactNode[] = []

  parts.forEach((part, index) => {
    // Add a line break before each part except the first
    // This ensures newlines at the start of text are preserved
    if (index > 0) {
      nodes.push(<br key={`${keyPrefix}-br-${index}`} />)
    }
    // Add the text content (wrap in span for React keys)
    // Even empty strings get a span to preserve empty lines
    if (part || index < parts.length - 1) {
      nodes.push(<span key={`${keyPrefix}-span-${index}`}>{part}</span>)
    }
  })

  return nodes
}

export function renderTextWithMentions(
  text: string,
  profiles: Map<string, SearchProfile>
): React.ReactNode[] {
  if (!text) return []

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  NOSTR_ENTITY_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = NOSTR_ENTITY_RE.exec(text)) !== null) {
    const decoded = match[1] ? decodeNostrEntity(match[1]) : null
    const beforeText = text.substring(lastIndex, match.index)

    if (beforeText) {
      parts.push(...textWithLineBreaks(beforeText, `text-${lastIndex}`))
    }

    // npub/nprofile render as atomic mention pills (resolved by pubkey so an
    // nprofile mention shows the profile name, not a truncated npub). note /
    // nevent / naddr fall through as plain text here — rich rendering is Phase 5.
    if (decoded && (decoded.type === 'npub' || decoded.type === 'nprofile')) {
      const profile = decoded.pubkey ? profiles.get(decoded.pubkey) : undefined
      const label = profile ? `@${getDisplayName(profile)}` : fallbackEntityLabel(decoded)

      parts.push(
        <span
          key={`mention-${match.index}`}
          contentEditable={false}
          data-mention={decoded.uri}
          className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium"
          style={{ userSelect: 'all' }}
        >
          {label}
        </span>
      )
    } else if (match[0]) {
      parts.push(...textWithLineBreaks(match[0], `raw-${match.index}`))
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(...textWithLineBreaks(text.substring(lastIndex), `text-${lastIndex}`))
  }

  return parts
}

/**
 * Converts HTML from contentEditable back to plain text with nostr: URIs
 * Preserves mention pills as nostr:npub... strings
 *
 * Handles both BR-based HTML (component-generated) and DIV-based HTML (browser-generated)
 */
export function htmlToPlainText(element: Node): string {
  let text = ''
  let isFirstChild = true

  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const content = (node.textContent || '').replace(/\u200B/g, '')
      text += content
      if (content) {
        isFirstChild = false
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement

      if (el.dataset.mention) {
        // Preserve the nostr:npub... URI
        text += el.dataset.mention
        isFirstChild = false
      } else if (el.tagName === 'BR') {
        // Convert <br> to newline
        text += '\n'
        // Don't set isFirstChild to false - BR is just a separator
      } else if (el.tagName === 'DIV') {
        // DIV elements represent lines in contentEditable (browser-generated when user presses Enter)
        // Add newline before each div (except the first one)
        if (!isFirstChild) {
          text += '\n'
        }

        // Check if div is empty (only contains a BR for cursor positioning)
        const hasOnlyBr = el.childNodes.length === 1 &&
                         el.firstChild?.nodeName === 'BR'

        if (hasOnlyBr) {
          // Empty line - don't process the BR inside
          // The newline was already added above
        } else {
          // Process div content
          const divContent = htmlToPlainText(node)
          text += divContent
        }

        isFirstChild = false
      } else if (el.tagName === 'SPAN') {
        // Process span content
        const spanContent = htmlToPlainText(node)
        text += spanContent
        if (spanContent) {
          isFirstChild = false
        }
      } else {
        // Recursively process other elements
        const childContent = htmlToPlainText(node)
        text += childContent
        if (childContent) {
          isFirstChild = false
        }
      }
    }
  })

  return text
}

/**
 * Gets the plain text content before the cursor position in a contentEditable element
 */
export function getTextBeforeCursor(element: HTMLDivElement): string {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return ''

  const range = selection.getRangeAt(0)
  const preCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(element)
  preCaretRange.setEnd(range.startContainer, range.startOffset)

  const tempDiv = document.createElement('div')
  tempDiv.appendChild(preCaretRange.cloneContents())

  return htmlToPlainText(tempDiv)
}

/**
 * Build a mention pill DOM node. `data-mention` carries the canonical
 * `nostr:...` URI so the serializer round-trips it verbatim. The element is
 * `contenteditable=false` + `user-select:all`, making it an atomic island:
 * the caret cannot enter it and selection grabs the whole pill.
 */
export function createPillElement(uri: string, label: string): HTMLSpanElement {
  const pill = document.createElement('span')
  pill.contentEditable = 'false'
  pill.dataset.mention = uri
  pill.className =
    'inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium'
  pill.style.userSelect = 'all'
  pill.textContent = label
  return pill
}

/**
 * Replace a text node containing nostr mentions with a mixed sequence of
 * plain-text nodes and atomic pill spans (in place, preserving document order).
 * Used to pillify pasted text immediately so a pasted `nostr:npub1...` can
 * never be left as breakable plain text. Returns the last inserted node
 * (for caret placement) and whether any tokens were converted.
 */
export function pillifyTextNode(
  textNode: Text,
  profiles: Map<string, SearchProfile>,
): { lastNode: Node; hadTokens: boolean } {
  const text = textNode.textContent || ''
  const parent = textNode.parentNode
  if (!parent) return { lastNode: textNode, hadTokens: false }

  const tokens: Array<{ index: number; length: number; decoded: DecodedEntity }> = []
  NOSTR_ENTITY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = NOSTR_ENTITY_RE.exec(text)) !== null) {
    if (!match[1]) continue
    const decoded = decodeNostrEntity(match[1])
    if (decoded && (decoded.type === 'npub' || decoded.type === 'nprofile')) {
      tokens.push({ index: match.index, length: match[0].length, decoded })
    }
  }

  if (tokens.length === 0) return { lastNode: textNode, hadTokens: false }

  let cursor = 0
  let lastNode: Node = textNode
  for (const t of tokens) {
    if (t.index > cursor) {
      parent.insertBefore(document.createTextNode(text.slice(cursor, t.index)), textNode)
    }
    const profile = t.decoded.pubkey ? profiles.get(t.decoded.pubkey) : undefined
    const label = profile ? `@${getDisplayName(profile)}` : fallbackEntityLabel(t.decoded)
    const pill = createPillElement(t.decoded.uri, label)
    parent.insertBefore(pill, textNode)
    lastNode = pill
    cursor = t.index + t.length
  }
  if (cursor < text.length) {
    const tail = document.createTextNode(text.slice(cursor))
    parent.insertBefore(tail, textNode)
    lastNode = tail
  }
  parent.removeChild(textNode)
  return { lastNode, hadTokens: true }
}

/**
 * Serialize a DOM range to plain text, preserving mention pills as their
 * `nostr:...` URIs. Used by copy/cut so a copied pill pastes back as a pill
 * (instead of its visible `@name` label, which would lose the pubkey).
 */
export function serializeRangeToText(range: Range): string {
  const fragment = range.cloneContents()
  const container = document.createElement('div')
  container.appendChild(fragment)
  return htmlToPlainText(container)
}
