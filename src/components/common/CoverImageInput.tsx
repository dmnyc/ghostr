import { useState, useRef, useCallback } from 'react'
import { Upload, X, Link, Loader2, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadToBlossom, isValidImageUrl, type UploadProgress } from '@/lib/blossom'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/hooks/useToast'

interface CoverImageInputProps {
  value?: string
  onChange: (url: string | undefined) => void
  disabled?: boolean
}

export function CoverImageInput({ value, onChange, disabled }: CoverImageInputProps) {
  const { signer } = useAuthStore()
  const [urlInput, setUrlInput] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!signer) {
        toast({
          title: 'Not authenticated',
          description: 'Please log in to upload images.',
          variant: 'destructive',
        })
        return
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid file type',
          description: 'Please select an image file (jpg, png, gif, webp).',
          variant: 'destructive',
        })
        return
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        toast({
          title: 'File too large',
          description: 'Please select an image under 10MB.',
          variant: 'destructive',
        })
        return
      }

      setIsUploading(true)
      setUploadProgress({ loaded: 0, total: file.size, percent: 0 })

      try {
        const result = await uploadToBlossom(file, signer, undefined, setUploadProgress)
        onChange(result.url)
        toast({
          title: 'Image uploaded',
          description: 'Your cover image has been uploaded.',
        })
      } catch (err) {
        console.error('Upload failed:', err)
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'Failed to upload image.',
          variant: 'destructive',
        })
      } finally {
        setIsUploading(false)
        setUploadProgress(null)
      }
    },
    [signer, onChange]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0 && files[0]) {
      handleFileSelect(files[0])
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const handleUrlSubmit = () => {
    const url = urlInput.trim()
    if (!url) return

    if (!isValidImageUrl(url)) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid image URL.',
        variant: 'destructive',
      })
      return
    }

    onChange(url)
    setUrlInput('')
  }

  const handleUrlKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleUrlSubmit()
    }
  }

  const handleClear = () => {
    onChange(undefined)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled && !isUploading) {
      setIsDragOver(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    if (disabled || isUploading) return

    const files = e.dataTransfer.files
    if (files && files.length > 0 && files[0]) {
      handleFileSelect(files[0])
    }
  }

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click()
    }
  }

  return (
    <div className="space-y-3">
      <Label>Cover Image</Label>

      {/* Preview or Drop Zone */}
      <div
        className={`
          relative rounded-lg border-2 border-dashed overflow-hidden cursor-pointer
          transition-colors
          ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-muted-foreground/50'}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {value ? (
          // Image Preview
          <div className="relative aspect-video">
            <img
              src={value}
              alt="Cover preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Show error state if image fails to load
                e.currentTarget.src = ''
                e.currentTarget.alt = 'Failed to load image'
              }}
            />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  handleClear()
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          // Upload Zone
          <div className="flex flex-col items-center justify-center py-8 px-4">
            {isUploading ? (
              <>
                <Loader2 className="h-10 w-10 text-muted-foreground animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">
                  Uploading... {uploadProgress?.percent ?? 0}%
                </p>
              </>
            ) : (
              <>
                <ImageIcon className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground text-center">
                  Drag & drop an image or click to upload
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  JPG, PNG, GIF, WebP (max 10MB)
                </p>
              </>
            )}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleInputChange}
          disabled={disabled || isUploading}
        />
      </div>

      {/* URL Input */}
      {!value && !isUploading && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={handleUrlKeyDown}
              placeholder="Or paste image URL..."
              className="pl-9"
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleUrlSubmit}
            disabled={disabled || !urlInput.trim()}
          >
            <Upload className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
