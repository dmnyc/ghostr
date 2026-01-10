import React from 'react'
import { type SearchProfile } from '@/services/profileSearchService'

/**
 * Renders text with nostr:npub mentions replaced by visual pills
 * Pills show the profile name/username and are atomic (deleted as a unit)
 */
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
      parts.push(beforeText)
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
    parts.push(text.substring(lastIndex))
  }

  return parts
}

/**
 * Converts HTML from contentEditable back to plain text with nostr: URIs
 * Preserves mention pills as nostr:npub... strings
 */
export function htmlToPlainText(element: Node): string {
  let text = ''

  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (el.dataset.mention) {
        // Preserve the nostr:npub... URI
        text += el.dataset.mention
      } else {
        // Recursively process other elements
        text += htmlToPlainText(node)
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
