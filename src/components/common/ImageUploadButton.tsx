import { useState, useRef, useCallback } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadToBlossom, type UploadProgress } from '@/lib/blossom'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/hooks/useToast'

interface ImageUploadButtonProps {
  onUpload: (url: string) => void
  disabled?: boolean
}

export function ImageUploadButton({ onUpload, disabled }: ImageUploadButtonProps) {
  const { signer } = useAuthStore()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
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
        onUpload(result.url)
        toast({
          title: 'Image uploaded',
          description: 'Image URL has been added to your post.',
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
    [signer, onUpload]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0 && files[0]) {
      handleFileSelect(files[0])
    }
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  const handleClick = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click()
    }
  }

  const handleCancel = () => {
    // Note: True cancellation would require AbortController in uploadToBlossom
    // For now, just reset the state
    setIsUploading(false)
    setUploadProgress(null)
  }

  if (isUploading) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled className="gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {uploadProgress?.percent ?? 0}%
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleCancel}
          title="Cancel upload"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={disabled}
        className="gap-2"
      >
        <ImagePlus className="h-4 w-4" />
        Upload Image
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled || isUploading}
      />
    </>
  )
}
