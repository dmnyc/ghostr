import { useState, useRef, useEffect, useCallback, forwardRef } from 'react'
import { Loader2, User } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { useProfileSearch } from '@/hooks/useProfileSearch'
import { getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'
import { nip19 } from 'nostr-tools'
import { cn } from '@/lib/utils/cn'

interface MentionTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minHeight?: string
}

interface MentionMatch {
  query: string
  startIndex: number
  endIndex: number
}

export const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
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
    const [mentionMatch, setMentionMatch] = useState<MentionMatch | null>(null)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })

    const internalRef = useRef<HTMLTextAreaElement>(null)
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef
    const listRef = useRef<HTMLDivElement>(null)

    const { results, isLoading, search, clear } = useProfileSearch(300)

    // Detect @mention pattern
    const detectMention = useCallback(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      const cursorPos = textarea.selectionStart
      const textBeforeCursor = value.substring(0, cursorPos)

      // Match @username pattern (2+ chars after @)
      const match = textBeforeCursor.match(/@([\w]{2,})$/)

      if (match && match[1] && match[0]) {
        const query = match[1]
        const startIndex = cursorPos - match[0].length
        const endIndex = cursorPos

        setMentionMatch({ query, startIndex, endIndex })
        search(query)
        setIsOpen(true)

        // Calculate popover position
        updatePopoverPosition(textarea, startIndex)
      } else {
        setMentionMatch(null)
        setIsOpen(false)
        clear()
      }
    }, [value, search, clear, textareaRef])

    // Update popover position based on cursor
    const updatePopoverPosition = (textarea: HTMLTextAreaElement, startIndex: number) => {
      // Create a hidden div to measure text position
      const div = document.createElement('div')
      const style = window.getComputedStyle(textarea)

      // Copy textarea styles
      div.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        width: ${textarea.clientWidth}px;
        font: ${style.font};
        padding: ${style.padding};
        border: ${style.border};
        line-height: ${style.lineHeight};
      `

      // Get text up to cursor
      const textBeforeCursor = value.substring(0, startIndex)
      div.textContent = textBeforeCursor

      // Add a span at the cursor position
      const span = document.createElement('span')
      span.textContent = '@'
      div.appendChild(span)

      document.body.appendChild(div)

      const spanRect = span.getBoundingClientRect()
      const textareaRect = textarea.getBoundingClientRect()

      // Calculate position relative to textarea
      const top = spanRect.top - textareaRect.top + textarea.scrollTop + 24
      const left = spanRect.left - textareaRect.left

      document.body.removeChild(div)

      setPopoverPosition({
        top: Math.min(top, textarea.clientHeight - 20),
        left: Math.min(left, textarea.clientWidth - 200),
      })
    }

    // Detect mentions on value change and cursor movement
    useEffect(() => {
      detectMention()
    }, [detectMention])

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
        if (!mentionMatch) return

        // Create nostr: URI
        const nostrUri = `nostr:${nip19.npubEncode(profile.pubkey)}`

        // Replace @query with nostr:npub
        const newValue =
          value.substring(0, mentionMatch.startIndex) +
          nostrUri +
          ' ' +
          value.substring(mentionMatch.endIndex)

        onChange(newValue)
        setIsOpen(false)
        setMentionMatch(null)
        clear()

        // Move cursor after the inserted mention
        setTimeout(() => {
          const textarea = textareaRef.current
          if (textarea) {
            const newPos = mentionMatch.startIndex + nostrUri.length + 1
            textarea.setSelectionRange(newPos, newPos)
            textarea.focus()
          }
        }, 0)
      },
      [mentionMatch, value, onChange, clear, textareaRef]
    )

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
          setMentionMatch(null)
          clear()
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

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value)
    }

    const handleClick = () => {
      detectMention()
    }

    return (
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onSelect={detectMention}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(className)}
          style={{ minHeight }}
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

              {!isLoading && results.length === 0 && mentionMatch && (
                <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                  No results found
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    )
  }
)

MentionTextarea.displayName = 'MentionTextarea'
