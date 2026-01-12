import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ImageThumbnailGridProps {
  images: string[];
  onRemove: (url: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ImageThumbnailGrid({
  images,
  onRemove,
  disabled,
  className
}: ImageThumbnailGridProps) {
  if (images.length === 0) return null;

  return (
    <div className={cn("border-t pt-4 space-y-2", className)}>
      <p className="text-sm text-muted-foreground">
        Attached Images ({images.length})
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {images.map((url, index) => (
          <div
            key={url}
            className="relative group aspect-square bg-muted rounded-md overflow-hidden"
          >
            <img
              src={url}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <button
              type="button"
              onClick={() => onRemove(url)}
              disabled={disabled}
              className="absolute top-1 right-1 bg-destructive text-destructive-foreground
                         rounded-full p-1 opacity-0 group-hover:opacity-100
                         transition-opacity disabled:opacity-50"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
