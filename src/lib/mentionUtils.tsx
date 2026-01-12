import React from 'react'
import { type SearchProfile } from '@/services/profileSearchService'

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
  mentionedProfiles: Map<string, SearchProfile>
): React.ReactNode[] {
  if (!text) return []

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const mentionRegex = /nostr:(npub1[a-z0-9]{58,}|nprofile1[a-z0-9]{58,})/g
  let match: RegExpExecArray | null

  while ((match = mentionRegex.exec(text)) !== null) {
    const fullMention = match[0]
    const beforeText = text.substring(lastIndex, match.index)

    if (beforeText) {
      parts.push(...textWithLineBreaks(beforeText, `text-${lastIndex}`))
    }

    const profile = mentionedProfiles.get(fullMention)
    const displayName = profile?.displayName || profile?.name || fullMention.substring(6, 16) + '...'

    parts.push(
      <span
        key={`mention-${match.index}`}
        contentEditable={false}
        data-mention={fullMention}
        className="inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium"
        style={{ userSelect: 'all' }}
      >
        @{displayName}
      </span>
    )

    lastIndex = match.index + fullMention.length
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
