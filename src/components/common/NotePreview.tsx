import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { extractImageUrls } from '@/lib/blossom'

interface NotePreviewProps {
  content: string
  className?: string
}

export function NotePreview({ content, className }: NotePreviewProps) {
  const imageUrls = useMemo(() => extractImageUrls(content), [content])

  if (imageUrls.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="grid gap-2" style={{
        gridTemplateColumns: imageUrls.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))'
      }}>
        {imageUrls.map((url, index) => (
          <ImagePreview key={`${url}-${index}`} url={url} />
        ))}
      </div>
    </div>
  )
}

interface ImagePreviewProps {
  url: string
}

function ImagePreview({ url }: ImagePreviewProps) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (error) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 flex items-center justify-center text-sm text-muted-foreground">
        Failed to load image
      </div>
    )
  }

  return (
    <div className="relative rounded-lg overflow-hidden border bg-muted/30">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        src={url}
        alt=""
        className={`w-full h-auto object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  )
}

interface NotePreviewWithRemoveProps {
  content: string
  onRemoveImage: (url: string) => void
  className?: string
}

export function NotePreviewWithRemove({ content, onRemoveImage, className }: NotePreviewWithRemoveProps) {
  const imageUrls = useMemo(() => extractImageUrls(content), [content])

  if (imageUrls.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="grid gap-2" style={{
        gridTemplateColumns: imageUrls.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))'
      }}>
        {imageUrls.map((url, index) => (
          <ImagePreviewWithRemove
            key={`${url}-${index}`}
            url={url}
            onRemove={() => onRemoveImage(url)}
          />
        ))}
      </div>
    </div>
  )
}

interface ImagePreviewWithRemoveProps {
  url: string
  onRemove: () => void
}

function ImagePreviewWithRemove({ url, onRemove }: ImagePreviewWithRemoveProps) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (error) {
    return (
      <div className="relative rounded-lg border bg-muted/30 p-4 flex items-center justify-center text-sm text-muted-foreground">
        Failed to load image
        <button
          type="button"
          onClick={onRemove}
          className="absolute top-2 right-2 p-1 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          title="Remove image"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative rounded-lg overflow-hidden border bg-muted/30 group">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        src={url}
        alt=""
        className={`w-full h-auto object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-2 right-2 p-1.5 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove image"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
