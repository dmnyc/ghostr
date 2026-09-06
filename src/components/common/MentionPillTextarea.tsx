import { useState, useRef, useEffect, forwardRef, useCallback, useMemo } from 'react'
import ReactDOMServer from 'react-dom/server'
import { Loader2, User } from 'lucide-react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { useProfileSearch, useProfileQueries } from '@/hooks/queries/useProfileQuery'
import { getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'
import { nip19 } from 'nostr-tools'
import { cn } from '@/lib/utils/cn'
import { useDebounce } from '@/hooks/useDebounce'
import { renderTextWithMentions, htmlToPlainText, getTextBeforeCursor, createPillElement, pillifyTextNode, serializeRangeToText } from '@/lib/mentionUtils'
import { extractMentionedPubkeys, NOSTR_ENTITY_RE, decodeNostrEntity } from '@/lib/nostrEntities'
import { RichNotePreview } from '@/components/common/RichNotePreview'

interface MentionPillTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minHeight?: string
  compact?: boolean
}

/**
 * If the caret sits strictly inside a plain-text nostr token (one that has not
 * yet been promoted to an atomic pill), move it to a token boundary so the
 * pending edit cannot split or partially overwrite the identifier. Insert
 * operations snap to the token end; backward-delete snaps to the start.
 */
function snapCaretOutOfToken(
  selection: Selection,
  inputType: string,
  container: HTMLDivElement,
): void {
  const range = selection.getRangeAt(0)
  if (!range.collapsed) return
  const node = range.startContainer
  const offset = range.startOffset
  if (node.nodeType !== Node.TEXT_NODE) return

  // Skip when the text node lives inside a pill (handled by the pill guard)
  let parent: Node | null = node.parentNode
  while (parent && parent !== container) {
    if (parent.nodeType === Node.ELEMENT_NODE && (parent as HTMLElement).dataset.mention) return
    parent = parent.parentNode
  }

  const text = node.textContent || ''
  NOSTR_ENTITY_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = NOSTR_ENTITY_RE.exec(text)) !== null) {
    const start = match.index
    const end = match.index + match[0].length
    if (offset > start && offset < end) {
      const target = inputType.startsWith('deleteBackward') ? start : end
      const newRange = document.createRange()
      newRange.setStart(node, target)
      newRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(newRange)
      return
    }
  }
}

/**
 * Enhanced textarea with @ mention autocomplete and visual mention pills
 * Mentions appear as pills with profile names and are atomic (deleted as a unit)
 */
export const MentionPillTextarea = forwardRef<HTMLDivElement, MentionPillTextareaProps>(
  (
    {
      value,
      onChange,
      placeholder = 'Write something...',
      disabled = false,
      className,
      minHeight = '200px',
      compact = false,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })
    const [searchQuery, setSearchQuery] = useState('')
    const [mentionedProfiles, setMentionedProfiles] = useState<Map<string, SearchProfile>>(new Map())
    const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write')

    const internalRef = useRef<HTMLDivElement>(null)
    const contentEditableRef = (ref as React.RefObject<HTMLDivElement>) || internalRef
    const listRef = useRef<HTMLDivElement>(null)
    const isInternalUpdate = useRef(false)
    const hasUserInteracted = useRef(false)
    const lastValueRef = useRef('')
    const isInitialized = useRef(false)

    // Debounce search query for React Query
    const debouncedQuery = useDebounce(searchQuery, 150)

    // Use React Query for profile search with automatic caching
    const { data: results = [], isLoading } = useProfileSearch(debouncedQuery)

    // Deduplicated pubkeys referenced by npub/nprofile mentions (for batch fetch)
    const mentionedPubkeys = useMemo(() => extractMentionedPubkeys(value), [value])

    // Fetch all mentioned profiles using React Query
    const { profiles: fetchedProfiles } = useProfileQueries(mentionedPubkeys)

    // Update mentionedProfiles map when profiles are fetched
    useEffect(() => {
      const newProfiles = new Map<string, SearchProfile>()

      fetchedProfiles.forEach((profile) => {
        newProfiles.set(profile.pubkey, profile)
      })

      // Only update if the Map actually changed
      setMentionedProfiles(prev => {
        if (prev.size !== newProfiles.size) return newProfiles

        for (const [key, value] of newProfiles) {
          if (!prev.has(key) || prev.get(key)?.pubkey !== value.pubkey) {
            return newProfiles
          }
        }

        return prev // No change, return same reference
      })
    }, [fetchedProfiles])

    // (Re)build the contentEditable DOM from value + resolved profiles.
    useEffect(() => {
      const editor = contentEditableRef.current
      if (!editor) return

      // Ignore the value echo that follows an internal edit (DOM already updated).
      if (isInternalUpdate.current) {
        isInternalUpdate.current = false
        lastValueRef.current = value
        return
      }

      // Re-render when value changes externally, OR when profiles resolve and
      // the editor isn't focused (avoids clobbering the caret mid-edit). The
      // editor initializes immediately even if profiles never load (429 /
      // outage) — pills show a fallback label until the profile resolves.
      const valueChanged = lastValueRef.current !== value
      if (!valueChanged && document.activeElement === editor) return

      if (valueChanged) lastValueRef.current = value
      isInitialized.current = true

      const nodes = renderTextWithMentions(value, mentionedProfiles)
      const newHTML = ReactDOMServer.renderToStaticMarkup(<>{nodes}</>)
      if (editor.innerHTML !== newHTML) {
        editor.innerHTML = newHTML
      }
    }, [value, mentionedProfiles, contentEditableRef, activeTab])

    // Refresh pill labels in-place when profiles resolve (e.g. a pill pasted
    // before its profile was fetched). Mutating textContent of contenteditable
    // pills doesn't disturb the caret, so this is safe to run while focused.
    useEffect(() => {
      const editor = contentEditableRef.current
      if (!editor) return
      editor.querySelectorAll<HTMLElement>('[data-mention]').forEach((span) => {
        const uri = span.dataset.mention
        if (!uri) return
        const decoded = decodeNostrEntity(uri)
        if (!decoded?.pubkey) return
        const profile = mentionedProfiles.get(decoded.pubkey)
        if (!profile) return
        const label = `@${getDisplayName(profile)}`
        if (span.textContent !== label) span.textContent = label
      })
    }, [mentionedProfiles, contentEditableRef])

    // Handle before input to make mentions atomic
    const handleBeforeInput = (event: React.FormEvent<HTMLDivElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent
      if (nativeEvent.isComposing || nativeEvent.inputType === 'historyUndo' || nativeEvent.inputType === 'historyRedo') {
        return
      }

      const selection = window.getSelection()
      if (!selection) return
      const range = selection.getRangeAt(0)
      let node = range.startContainer

      // Prevent typing inside mention pills
      while (node && node !== contentEditableRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).dataset.mention) {
          event.preventDefault()

          // Move cursor after the mention
          if (nativeEvent.inputType === 'insertText' || nativeEvent.inputType === 'insertCompositionText') {
            const newRange = document.createRange()
            newRange.setStartAfter(node)
            newRange.collapse(true)
            selection.removeAllRanges()
            selection.addRange(newRange)
          }
          return
        }
        const parent = node.parentNode
        if (!parent) break
        node = parent
      }

      // Prevent splitting or partially editing a plain-text nostr token that
      // hasn't been promoted to a pill yet (e.g. just typed). Snap the caret to
      // a token boundary so the default action lands outside the identifier.
      const inputType = nativeEvent.inputType
      if (inputType.startsWith('insert') || inputType.startsWith('delete')) {
        snapCaretOutOfToken(selection, inputType, contentEditableRef.current)
      }
    }

    const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
      isInternalUpdate.current = true
      hasUserInteracted.current = true

      const newText = htmlToPlainText(e.currentTarget)
      onChange(newText)

      const textBeforeCursor = getTextBeforeCursor(e.currentTarget)

      // Match @username pattern (2+ chars after @)
      const match = textBeforeCursor.match(/@([\w]{2,})$/)

      if (match && match[1] && match[0]) {
        const query = match[1]
        setSearchQuery(query)
        setIsOpen(true)

        // Calculate popover position near cursor
        updatePopoverPosition(e.currentTarget)
      } else {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    // Update popover position based on cursor using browser selection API
    const updatePopoverPosition = (element: HTMLDivElement) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) {
        // Fallback to top-left of element
        setPopoverPosition({ top: 24, left: 0 })
        return
      }

      const range = selection.getRangeAt(0)
      const elementRect = element.getBoundingClientRect()

      // Clone range and collapse to get caret position
      const caretRange = range.cloneRange()
      caretRange.collapse(false)

      // Insert a temporary span to get accurate position
      const tempSpan = document.createElement('span')
      tempSpan.textContent = '\u200B' // Zero-width space
      caretRange.insertNode(tempSpan)

      const spanRect = tempSpan.getBoundingClientRect()

      // Calculate position relative to element
      const top = spanRect.bottom - elementRect.top + element.scrollTop + 4
      const left = spanRect.left - elementRect.left

      // Remove temp span and restore selection
      tempSpan.remove()

      // Normalize to merge adjacent text nodes
      element.normalize()

      setPopoverPosition({
        top: Math.min(top, element.clientHeight + 20),
        left: Math.max(0, Math.min(left, element.clientWidth - 200)),
      })
    }

    // Reset highlight when results change
    useEffect(() => {
      setHighlightedIndex(results.length > 0 ? 0 : -1)
    }, [results])

    // Scroll highlighted item into view
    useEffect(() => {
      if (highlightedIndex >= 0 && listRef.current) {
        const items = listRef.current.querySelectorAll('[data-mention-item]')
        const item = items[highlightedIndex] as HTMLElement
        if (item) {
          item.scrollIntoView({ block: 'nearest' })
        }
      }
    }, [highlightedIndex])

    const handleSelect = useCallback(
      (profile: SearchProfile) => {
        const selection = window.getSelection()
        if (!selection || !contentEditableRef.current) return

        const range = selection.getRangeAt(0)
        const textBeforeCursor = getTextBeforeCursor(contentEditableRef.current)

        // Find @ match - include the full query that might be an npub
        const atMatch = textBeforeCursor.match(/@([\w]+)$/)

        if (atMatch && atMatch[0]) {
          const matchText = atMatch[0]
          const matchLength = matchText.length

          // Walk backwards through the DOM to find and delete the match
          // This handles cases where the text might span multiple nodes
          let remaining = matchLength
          let currentNode = range.startContainer
          let currentOffset = range.startOffset

          // If we're in an element node, find the last text node
          if (currentNode.nodeType === Node.ELEMENT_NODE) {
            const textNodes: Text[] = []
            const walker = document.createTreeWalker(
              currentNode,
              NodeFilter.SHOW_TEXT,
              null
            )
            let node: Node | null
            while ((node = walker.nextNode())) {
              textNodes.push(node as Text)
            }
            if (textNodes.length > 0) {
              currentNode = textNodes[textNodes.length - 1]!
              currentOffset = (currentNode as Text).length
            }
          }

          // Delete characters backwards
          while (remaining > 0 && currentNode) {
            if (currentNode.nodeType === Node.TEXT_NODE) {
              const textNode = currentNode as Text
              const deleteCount = Math.min(remaining, currentOffset)

              if (deleteCount > 0) {
                textNode.deleteData(currentOffset - deleteCount, deleteCount)
                remaining -= deleteCount
                currentOffset -= deleteCount
              }

              if (remaining > 0) {
                // Move to previous sibling or parent's previous text node
                let prev = currentNode.previousSibling
                while (prev && prev.nodeType !== Node.TEXT_NODE) {
                  prev = prev.previousSibling
                }
                if (prev) {
                  currentNode = prev
                  currentOffset = (prev as Text).length
                } else {
                  break
                }
              }
            } else {
              break
            }
          }
        }

        // Create nostr: URI
        const mention = `nostr:${nip19.npubEncode(profile.pubkey)}`

        // Create pill element
        const pill = createPillElement(mention, `@${getDisplayName(profile)}`)

        // Insert at current cursor position
        const newRange = document.createRange()
        newRange.setStart(range.startContainer, range.startOffset)
        newRange.collapse(true)
        newRange.insertNode(pill)

        // Position cursor after pill (no space added - user types it if needed)
        newRange.setStartAfter(pill)
        newRange.collapse(true)

        selection.removeAllRanges()
        selection.addRange(newRange)

        // Update mentioned profiles map (keyed by pubkey, matching renderTextWithMentions)
        setMentionedProfiles((prev) => new Map(prev).set(profile.pubkey, profile))

        // Trigger input event to update parent state
        if (contentEditableRef.current) {
          handleInput({ currentTarget: contentEditableRef.current } as React.FormEvent<HTMLDivElement>)
        }

        setIsOpen(false)
        setSearchQuery('')
      },
      [contentEditableRef]
    )

    // Handle paste events - strip formatting and prevent image pastes
    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const items = e.clipboardData?.items
      if (!items) return

      // Check if any item is an image
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item && item.type.startsWith('image/')) {
          e.preventDefault()
          // Show a toast message directing user to the upload button
          if (window.confirm('Image pasting is not supported. Please use the Upload Image button instead.')) {
            // User acknowledged
          }
          return
        }
      }

      // For text pastes, strip all formatting and insert as plain text
      e.preventDefault()
      const plainText = e.clipboardData.getData('text/plain')
      if (!plainText) return
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      range.deleteContents()
      const textNode = document.createTextNode(plainText)
      range.insertNode(textNode)

      // Promote any nostr mentions in the pasted text to atomic pills so a
      // pasted nostr:npub1... / nostr:nprofile1... can never be left as
      // breakable plain text.
      const { lastNode } = pillifyTextNode(textNode, mentionedProfiles)

      // Move caret to the end of the inserted content
      const caret = document.createRange()
      caret.setStartAfter(lastNode)
      caret.collapse(true)
      selection.removeAllRanges()
      selection.addRange(caret)

      if (contentEditableRef.current) {
        handleInput({ currentTarget: contentEditableRef.current } as React.FormEvent<HTMLDivElement>)
      }
    }

    // Copy/cut a selection as the serialized plaintext (pills -> nostr: URIs)
    // so a copied pill pastes back as a pill instead of its visible @name label.
    const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
      const text = serializeRangeToText(selection.getRangeAt(0))
      e.clipboardData.setData('text/plain', text)
      e.preventDefault()
    }

    const handleCut = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
      const text = serializeRangeToText(selection.getRangeAt(0))
      e.clipboardData.setData('text/plain', text)
      e.preventDefault()
      selection.deleteFromDocument()
      if (contentEditableRef.current) {
        handleInput({ currentTarget: contentEditableRef.current } as React.FormEvent<HTMLDivElement>)
      }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const selection = window.getSelection()
      if (!selection || !selection.rangeCount) return
      const range = selection.getRangeAt(0)

      // Handle Delete key to remove mention pill after cursor
      if (e.key === 'Delete' && range.collapsed) {
        const { startContainer, startOffset } = range
        if (startContainer.nodeType === Node.TEXT_NODE) {
          const textNode = startContainer as Text
          if (startOffset === textNode.length) {
            const nextSibling = startContainer.nextSibling
            if (nextSibling && nextSibling.nodeType === Node.ELEMENT_NODE && (nextSibling as HTMLElement).dataset.mention) {
              e.preventDefault()
              nextSibling.remove()
              if (contentEditableRef.current) {
                handleInput({ currentTarget: contentEditableRef.current } as React.FormEvent<HTMLDivElement>)
              }
              return
            }
          }
        }
      }

      // Handle Backspace to remove mention pill before cursor
      if (e.key === 'Backspace') {
        // Check if a mention pill is selected
        if (!range.collapsed) {
          const container = range.commonAncestorContainer
          let mentionElement: HTMLElement | null = null

          if (container.nodeType === Node.ELEMENT_NODE) {
            const el = container as HTMLElement
            if (el.dataset.mention) {
              mentionElement = el
            }
          } else if (container.parentElement?.dataset.mention) {
            mentionElement = container.parentElement
          }

          if (mentionElement) {
            e.preventDefault()
            mentionElement.remove()
            if (contentEditableRef.current) {
              handleInput({ currentTarget: contentEditableRef.current } as React.FormEvent<HTMLDivElement>)
            }
            return
          }
        }

        // Handle backspace at start of text node after mention
        if (range.collapsed) {
          const { startContainer, startOffset } = range
          if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
            const prevSibling = startContainer.previousSibling
            if (prevSibling && prevSibling.nodeType === Node.ELEMENT_NODE && (prevSibling as HTMLElement).dataset.mention) {
              e.preventDefault()
              prevSibling.remove()
              if (contentEditableRef.current) {
                handleInput({ currentTarget: contentEditableRef.current } as React.FormEvent<HTMLDivElement>)
              }
              return
            }
          }
        }
      }

      // Handle dropdown navigation
      if (!isOpen || results.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          break
        case 'Enter': {
          const profile = results[highlightedIndex]
          if (highlightedIndex >= 0 && profile) {
            e.preventDefault()
            handleSelect(profile)
          }
          break
        }
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setSearchQuery('')
          break
        case 'Tab': {
          const tabProfile = results[highlightedIndex]
          if (highlightedIndex >= 0 && tabProfile) {
            e.preventDefault()
            handleSelect(tabProfile)
          }
          break
        }
      }
    }

    return (
      <div className={cn(compact ? "rounded-lg border bg-background overflow-hidden max-w-full" : "rounded-lg border velvet bg-card overflow-hidden max-w-full", className)}>
        <div className={cn("flex border-b bg-muted/30", compact && "hidden")}>
          <button
            type="button"
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'write'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab('write')}
          >
            Write
          </button>
          <button
            type="button"
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              activeTab === 'preview'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => { setActiveTab('preview'); setIsOpen(false); setSearchQuery('') }}
          >
            Preview
          </button>
        </div>

        {activeTab === 'write' ? (
          <div className="relative max-w-full overflow-hidden">
            <div
              ref={contentEditableRef}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onPaste={handlePaste}
          onCopy={handleCopy}
          onCut={handleCut}
          onClick={() => { hasUserInteracted.current = true }}
          onFocus={() => { hasUserInteracted.current = true }}
          contentEditable={!disabled}
          className={cn(
            'relative p-3 bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'whitespace-pre-wrap break-words max-w-full overflow-x-auto',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{
            minHeight,
            wordBreak: 'normal',
            overflowWrap: 'anywhere'
          }}
          data-placeholder={placeholder}
        />

        <Popover open={isOpen}>
          <PopoverAnchor asChild>
            <div
              className="absolute pointer-events-none"
              style={{
                top: popoverPosition.top,
                left: popoverPosition.left,
                width: 1,
                height: 1,
              }}
            />
          </PopoverAnchor>

          <PopoverContent
            className="w-64 p-0"
            align="start"
            side="bottom"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div ref={listRef} className="max-h-48 overflow-y-auto">
              {results.length === 0 && !(!isLoading && debouncedQuery === searchQuery) && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching…
                </div>
              )}

              {results.map((profile, index) => (
                <button
                  key={profile.pubkey}
                  data-mention-item
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                    highlightedIndex === index && 'bg-muted'
                  )}
                  onClick={() => handleSelect(profile)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {profile.picture ? (
                    <img
                      src={profile.picture}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.nextElementSibling?.classList.remove('hidden')
                      }}
                    />
                  ) : null}
                  <div
                    className={cn(
                      'h-6 w-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0',
                      profile.picture && 'hidden'
                    )}
                  >
                    <User className="h-3 w-3 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {getDisplayName(profile)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {profile.nip05 || formatNpub(profile.pubkey)}
                    </div>
                  </div>
                </button>
              ))}

              {!isLoading && results.length === 0 && searchQuery && debouncedQuery === searchQuery && (
                <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                  No results found
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <style>{`
          [contenteditable][data-placeholder]:empty:before {
            content: attr(data-placeholder);
            color: hsl(var(--muted-foreground));
            pointer-events: none;
          }
        `}</style>
          </div>
        ) : (
          <div className="p-3" style={{ minHeight }}>
            {value.trim() ? (
              <RichNotePreview content={value} className="text-sm" />
            ) : (
              <p className="text-muted-foreground italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>
    )
  }
)

MentionPillTextarea.displayName = 'MentionPillTextarea'
