import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, User, Star } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover'
import { useProfileSearch } from '@/hooks/useProfileSearch'
import { getDisplayName, formatNpub, type SearchProfile } from '@/services/profileSearchService'
import { cn } from '@/lib/utils/cn'

interface ProfileSearchInputProps {
  value: string
  onChange: (value: string) => void
  onSelect: (profile: SearchProfile) => void
  placeholder?: string
  disabled?: boolean
  favorites?: SearchProfile[]
  onToggleFavorite?: (profile: SearchProfile) => void
  isFavorite?: (pubkey: string) => boolean
  className?: string
}

export function ProfileSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search by name or paste npub...',
  disabled = false,
  favorites = [],
  onToggleFavorite,
  isFavorite,
  className,
}: ProfileSearchInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { results, isLoading, search, clear } = useProfileSearch(300)

  // Combine favorites and search results
  const showFavorites = !value.trim() && favorites.length > 0
  const displayResults = showFavorites ? [] : results
  const allItems = showFavorites ? favorites : displayResults

  // Trigger search when value changes
  useEffect(() => {
    if (value.trim()) {
      search(value)
    } else {
      clear()
    }
  }, [value, search, clear])

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [results, showFavorites])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-profile-item]')
      const item = items[highlightedIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  const handleSelect = useCallback(
    (profile: SearchProfile) => {
      onSelect(profile)
      onChange(profile.npub)
      setIsOpen(false)
      clear()
    },
    [onSelect, onChange, clear]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) =>
          prev < allItems.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter': {
        e.preventDefault()
        const profile = allItems[highlightedIndex]
        if (highlightedIndex >= 0 && profile) {
          handleSelect(profile)
        }
        break
      }
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        break
    }
  }

  const handleFocus = () => {
    setIsOpen(true)
  }

  const handleBlur = (e: React.FocusEvent) => {
    // Don't close if clicking within the popover
    const relatedTarget = e.relatedTarget as HTMLElement
    if (relatedTarget?.closest('[data-profile-popover]')) {
      return
    }
    // Delay to allow click events to fire
    setTimeout(() => setIsOpen(false), 150)
  }

  const handleToggleFavorite = (e: React.MouseEvent, profile: SearchProfile) => {
    e.stopPropagation()
    e.preventDefault()
    onToggleFavorite?.(profile)
  }

  return (
    <Popover open={isOpen && (allItems.length > 0 || isLoading)}>
      <PopoverAnchor asChild>
        <div className={cn('relative', className)}>
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-8"
          />
          {isLoading && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        data-profile-popover
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div
          ref={listRef}
          className="max-h-64 overflow-y-auto"
        >
          {showFavorites && (
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Star className="h-3 w-3" />
              Favorites
            </div>
          )}

          {allItems.map((profile, index) => (
            <button
              key={profile.pubkey}
              data-profile-item
              type="button"
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                highlightedIndex === index && 'bg-muted'
              )}
              onClick={() => handleSelect(profile)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {profile.picture ? (
                <img
                  src={profile.picture}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : null}
              <div
                className={cn(
                  'h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0',
                  profile.picture && 'hidden'
                )}
              >
                <User className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {getDisplayName(profile)}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {profile.nip05 || formatNpub(profile.pubkey)}
                </div>
              </div>

              {onToggleFavorite && (
                <button
                  type="button"
                  className="p-1 hover:bg-muted rounded flex-shrink-0"
                  onClick={(e) => handleToggleFavorite(e, profile)}
                  title={isFavorite?.(profile.pubkey) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star
                    className={cn(
                      'h-4 w-4',
                      isFavorite?.(profile.pubkey)
                        ? 'fill-yellow-500 text-yellow-500'
                        : 'text-muted-foreground'
                    )}
                  />
                </button>
              )}
            </button>
          ))}

          {!showFavorites && results.length === 0 && !isLoading && value.trim().length >= 2 && (
            <div className="px-3 py-4 text-sm text-center text-muted-foreground">
              No results found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
