import { LinkPreviewCard } from './LinkPreviewCard'
import { type LinkMetadata } from '@/lib/urlUtils'
import { cn } from '@/lib/utils/cn'

interface LinkPreviewGridProps {
  links: LinkMetadata[]
  onRemove?: (url: string) => void
  disabled?: boolean
  className?: string
}

export function LinkPreviewGrid({
  links,
  onRemove,
  disabled,
  className
}: LinkPreviewGridProps) {
  if (links.length === 0) return null

  return (
    <div className={cn("border-t pt-4 space-y-2", className)}>
      <p className="text-sm text-muted-foreground">
        Link Previews ({links.length})
      </p>
      <div className="space-y-2">
        {links.map((link) => (
          <LinkPreviewCard
            key={link.url}
            metadata={link}
            onRemove={onRemove}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}
