import { useState, useRef, useEffect, forwardRef, useCallback, useMemo } from 'react'
import ReactDOMServer from 'react-dom/server'
import { Loader2, User } from 'lucide-react'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { useProfileSearch, useProfileQueries } from '@/hooks/queries/useProfileQuery'
import { getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'
import { nip19 } from 'nostr-tools'
import { cn } from '@/lib/utils/cn'
import { useDebounce } from '@/hooks/useDebounce'
import { renderTextWithMentions, htmlToPlainText, getTextBeforeCursor } from '@/lib/mentionUtils'

interface MentionPillTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minHeight?: string
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
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })
    const [searchQuery, setSearchQuery] = useState('')
    const [mentionedProfiles, setMentionedProfiles] = useState<Map<string, SearchProfile>>(new Map())

    const internalRef = useRef<HTMLDivElement>(null)
    const contentEditableRef = (ref as React.RefObject<HTMLDivElement>) || internalRef
    const listRef = useRef<HTMLDivElement>(null)
    const isInternalUpdate = useRef(false)
    const hasUserInteracted = useRef(false)
    const lastValueRef = useRef('')
    const isInitialized = useRef(false)

    // Debounce search query for React Query
    const debouncedQuery = useDebounce(searchQuery, 300)

    // Use React Query for profile search with automatic caching
    const { data: results = [], isLoading } = useProfileSearch(debouncedQuery)

    // Extract npub mentions from value and convert to pubkeys
    const mentionedPubkeys = useMemo(() => {
      const regex = /nostr:(npub1[a-z0-9]{58,})/g
      const npubs: string[] = []
      let match: RegExpExecArray | null

      while ((match = regex.exec(value)) !== null) {
        if (match[1]) {
          npubs.push(match[1]) // Extract just the npub part
        }
      }

      // Convert npubs to pubkeys
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
    }, [value])

    // Fetch all mentioned profiles using React Query
    const { profiles: fetchedProfiles } = useProfileQueries(mentionedPubkeys)

    // Update mentionedProfiles map when profiles are fetched
    useEffect(() => {
      const newProfiles = new Map<string, SearchProfile>()

      fetchedProfiles.forEach((profile) => {
        const npub = nip19.npubEncode(profile.pubkey)
        const mention = `nostr:${npub}`
        newProfiles.set(mention, profile)
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

    // Update contentEditable when value changes from parent (external change)
    useEffect(() => {
      if (isInternalUpdate.current) {
        isInternalUpdate.current = false
        lastValueRef.current = value
        return
      }

      // On first render, initialize the content
      // If there are mentions in the value, wait for profiles to be fetched
      if (!isInitialized.current) {
        const hasMentions = /nostr:(npub1[a-z0-9]{58,})/.test(value)
        const profilesLoaded = !hasMentions || mentionedProfiles.size > 0

        if (profilesLoaded) {
          isInitialized.current = true
          lastValueRef.current = value

          if (contentEditableRef.current) {
            const nodes = renderTextWithMentions(value, mentionedProfiles)
            const newHTML = ReactDOMServer.renderToStaticMarkup(<>{nodes}</>)
            contentEditableRef.current.innerHTML = newHTML
          }
        }
        return
      }

      // Only run if value actually changed
      if (lastValueRef.current === value) {
        return
      }

      lastValueRef.current = value

      if (contentEditableRef.current) {
        const nodes = renderTextWithMentions(value, mentionedProfiles)
        const newHTML = ReactDOMServer.renderToStaticMarkup(<>{nodes}</>)

        if (contentEditableRef.current.innerHTML !== newHTML) {
          contentEditableRef.current.innerHTML = newHTML
        }
      }
    }, [value, mentionedProfiles, contentEditableRef])

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

        // Calculate popover position
        updatePopoverPosition(e.currentTarget, textBeforeCursor.length - match[0].length)
      } else {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    // Update popover position based on cursor
    const updatePopoverPosition = (element: HTMLDivElement, startIndex: number) => {
      // Create a hidden div to measure text position
      const div = document.createElement('div')
      const style = window.getComputedStyle(element)

      // Copy element styles
      div.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        width: ${element.clientWidth}px;
        font: ${style.font};
        padding: ${style.padding};
        border: ${style.border};
        line-height: ${style.lineHeight};
      `

      // Get text up to cursor
      const textBeforeCursor = htmlToPlainText(element).substring(0, startIndex)
      div.textContent = textBeforeCursor

      // Add a span at the cursor position
      const span = document.createElement('span')
      span.textContent = '@'
      div.appendChild(span)

      document.body.appendChild(div)

      const spanRect = span.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      // Calculate position relative to element
      const top = spanRect.top - elementRect.top + element.scrollTop + 24
      const left = spanRect.left - elementRect.left

      document.body.removeChild(div)

      setPopoverPosition({
        top: Math.min(top, element.clientHeight - 20),
        left: Math.min(left, element.clientWidth - 200),
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

        // Find @ match
        const atMatch = textBeforeCursor.match(/@([\w]+)$/)

        if (atMatch) {
          const match = atMatch[0]
          range.setStart(range.startContainer, range.startOffset - match.length)
          range.deleteContents()
        }

        // Create nostr: URI
        const mention = `nostr:${nip19.npubEncode(profile.pubkey)}`

        // Create pill element
        const pill = document.createElement('span')
        pill.contentEditable = 'false'
        pill.dataset.mention = mention
        pill.className = 'inline-flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium'
        pill.style.userSelect = 'all'
        pill.textContent = `@${getDisplayName(profile)}`

        range.insertNode(pill)

        // Position cursor after pill (no space added - user types it if needed)
        range.setStartAfter(pill)
        range.collapse(true)

        selection.removeAllRanges()
        selection.addRange(range)

        // Update mentioned profiles map
        setMentionedProfiles((prev) => new Map(prev).set(mention, profile))

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
      if (plainText) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0)
          range.deleteContents()
          const textNode = document.createTextNode(plainText)
          range.insertNode(textNode)
          range.setStartAfter(textNode)
          range.collapse(true)
          selection.removeAllRanges()
          selection.addRange(range)

          // Trigger input event to update parent state
          if (contentEditableRef.current) {
            handleInput({ currentTarget: contentEditableRef.current } as React.FormEvent<HTMLDivElement>)
          }
        }
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
      <div className="relative max-w-full overflow-hidden">
        <div
          ref={contentEditableRef}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onBeforeInput={handleBeforeInput}
          onPaste={handlePaste}
          onClick={() => { hasUserInteracted.current = true }}
          onFocus={() => { hasUserInteracted.current = true }}
          contentEditable={!disabled}
          className={cn(
            'relative p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'whitespace-pre-wrap break-words max-w-full overflow-x-auto',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
          style={{
            minHeight,
            wordBreak: 'normal',
            overflowWrap: 'break-word'
          }}
          data-placeholder={placeholder}
        />

        <Popover open={isOpen && (results.length > 0 || isLoading)}>
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
              {isLoading && results.length === 0 && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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

              {!isLoading && results.length === 0 && searchQuery && (
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
    )
  }
)

MentionPillTextarea.displayName = 'MentionPillTextarea'
