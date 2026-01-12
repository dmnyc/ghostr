import { ExternalLink, X, Loader2, AlertCircle, Image } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { type LinkMetadata, isImageUrl } from '@/lib/urlUtils'

interface LinkPreviewCardProps {
  metadata: LinkMetadata
  onRemove?: (url: string) => void
  disabled?: boolean
  className?: string
}

export function LinkPreviewCard({
  metadata,
  onRemove,
  disabled,
  className
}: LinkPreviewCardProps) {
  const { url, title, description, image, siteName, loading, error } = metadata
  const isImage = isImageUrl(url)

  // Extract filename from URL for image links
  const getFilename = (url: string) => {
    try {
      const pathname = new URL(url).pathname
      return pathname.split('/').pop() || 'image'
    } catch {
      return 'image'
    }
  }

  return (
    <div
      className={cn(
        "group relative border rounded-lg overflow-hidden hover:shadow-md transition-shadow",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex gap-3 p-3 no-underline text-foreground hover:text-foreground",
          disabled && "pointer-events-none"
        )}
      >
        {/* Placeholder icon for image URLs */}
        {isImage ? (
          <div className="flex-shrink-0 w-24 h-24 bg-muted rounded-md flex items-center justify-center">
            <Image className="h-10 w-10 text-muted-foreground" />
          </div>
        ) : (
          /* Preview Image for regular links */
          image && !error && (
            <div className="flex-shrink-0 w-24 h-24 bg-muted rounded-md overflow-hidden">
              <img
                src={image}
                alt={title || 'Preview'}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  // Hide image if it fails to load
                  e.currentTarget.style.display = 'none'
                }}
              />
            </div>
          )
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading preview...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm truncate">{error}</span>
            </div>
          ) : isImage ? (
            /* Special layout for image URLs */
            <>
              <h4 className="font-medium text-sm line-clamp-2 mb-1">
                {getFilename(url)}
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Image file
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{new URL(url).hostname}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </div>
            </>
          ) : (
            /* Regular link preview layout */
            <>
              {/* Title */}
              <h4 className="font-medium text-sm line-clamp-2 mb-1">
                {title || new URL(url).hostname}
              </h4>

              {/* Description */}
              {description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {description}
                </p>
              )}

              {/* Site name + domain */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {siteName && <span>{siteName}</span>}
                {siteName && <span>•</span>}
                <span className="truncate">{new URL(url).hostname}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </div>
            </>
          )}
        </div>
      </a>

      {/* Remove button */}
      {onRemove && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            onRemove(url)
          }}
          className="absolute top-2 right-2 bg-destructive text-destructive-foreground
                     rounded-full p-1 opacity-0 group-hover:opacity-100
                     transition-opacity hover:bg-destructive/90"
          title="Remove link preview"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
