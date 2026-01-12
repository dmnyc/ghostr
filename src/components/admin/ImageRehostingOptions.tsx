import { useState, useRef, useEffect } from 'react'
import { AlertTriangle, Loader2, Check, ExternalLink, RefreshCw, Link, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { extractImageUrls, replaceImageUrl, reuploadImageToBlossom, uploadToBlossom, isValidImageUrl } from '@/lib/blossom'
import { useAuthStore } from '@/stores/authStore'
import { toast } from '@/hooks/useToast'

type RehostOption = 'trust' | 'reupload' | 'custom'

interface ImageRehostingOptionsProps {
  content: string
  onContentChange: (newContent: string) => void
  disabled?: boolean
  originalContent?: string  // Original submission content to identify delegate-provided images
  coverImageUrl?: string  // Cover image URL from tags (for kind 30023)
  onCoverImageChange?: (newUrl: string) => void  // Callback when cover image is rehosted
}

interface ImageStatus {
  url: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  newUrl?: string
  customUrl?: string
  error?: string
}

export function ImageRehostingOptions({
  content,
  onContentChange,
  disabled,
  originalContent,
  coverImageUrl,
  onCoverImageChange,
}: ImageRehostingOptionsProps) {
  const { signer } = useAuthStore()
  // Store original delegate-provided URLs once on mount
  // Use originalContent if provided (delegate submission), otherwise use current content
  // Also include cover image URL if provided
  const originalUrlsRef = useRef<string[] | null>(null)
  if (originalUrlsRef.current === null) {
    const contentUrls = extractImageUrls(originalContent || content)
    const coverUrls = coverImageUrl ? [coverImageUrl] : []
    originalUrlsRef.current = [...contentUrls, ...coverUrls]
  }
  const originalUrls = originalUrlsRef.current

  const [selectedOption, setSelectedOption] = useState<RehostOption>('trust')
  const [imageStatuses, setImageStatuses] = useState<Record<string, ImageStatus>>(() =>
    Object.fromEntries(originalUrls.map((url) => [url, { url, status: 'pending' as const }]))
  )
  // Track current content for URL replacement
  const contentRef = useRef(content)
  useEffect(() => {
    contentRef.current = content
  }, [content])

  // Don't render if no images
  if (originalUrls.length === 0) {
    return null
  }

  const handleReuploadImage = async (originalUrl: string) => {
    if (!signer) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to re-upload images.',
        variant: 'destructive',
      })
      return
    }

    setImageStatuses((prev) => ({
      ...prev,
      [originalUrl]: { ...prev[originalUrl]!, status: 'uploading' },
    }))

    try {
      const result = await reuploadImageToBlossom(originalUrl, signer)

      setImageStatuses((prev) => ({
        ...prev,
        [originalUrl]: { ...prev[originalUrl]!, status: 'done', newUrl: result.url },
      }))

      // Update content with new URL (use ref for latest content)
      // If this is the cover image, update it separately
      if (originalUrl === coverImageUrl && onCoverImageChange) {
        onCoverImageChange(result.url)
      } else {
        onContentChange(replaceImageUrl(contentRef.current, originalUrl, result.url))
      }

      toast({
        title: 'Image re-uploaded',
        description: 'Image has been uploaded to your Blossom account.',
      })
    } catch (err) {
      console.error('Re-upload failed:', err)
      setImageStatuses((prev) => ({
        ...prev,
        [originalUrl]: {
          ...prev[originalUrl]!,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to re-upload',
        },
      }))
      toast({
        title: 'Re-upload failed',
        description: err instanceof Error ? err.message : 'Failed to re-upload image.',
        variant: 'destructive',
      })
    }
  }

  const handleReuploadAll = async () => {
    for (const url of originalUrls) {
      const status = imageStatuses[url]
      if (status?.status === 'pending') {
        await handleReuploadImage(url)
      }
    }
  }

  const handleUploadFile = async (originalUrl: string, file: File) => {
    if (!signer) {
      toast({
        title: 'Not authenticated',
        description: 'Please log in to upload images.',
        variant: 'destructive',
      })
      return
    }

    setImageStatuses((prev) => ({
      ...prev,
      [originalUrl]: { ...prev[originalUrl]!, status: 'uploading' },
    }))

    try {
      const result = await uploadToBlossom(file, signer)

      setImageStatuses((prev) => ({
        ...prev,
        [originalUrl]: { ...prev[originalUrl]!, status: 'done', newUrl: result.url },
      }))

      // Update content with new URL (use ref for latest content)
      // If this is the cover image, update it separately
      if (originalUrl === coverImageUrl && onCoverImageChange) {
        onCoverImageChange(result.url)
      } else {
        onContentChange(replaceImageUrl(contentRef.current, originalUrl, result.url))
      }

      toast({
        title: 'Image uploaded',
        description: 'Image has been uploaded to your Blossom account.',
      })
    } catch (err) {
      console.error('Upload failed:', err)
      setImageStatuses((prev) => ({
        ...prev,
        [originalUrl]: {
          ...prev[originalUrl]!,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to upload',
        },
      }))
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Failed to upload image.',
        variant: 'destructive',
      })
    }
  }

  const handleCustomUrlChange = (originalUrl: string, customUrl: string) => {
    setImageStatuses((prev) => ({
      ...prev,
      [originalUrl]: { ...prev[originalUrl]!, customUrl },
    }))
  }

  const handleApplyCustomUrl = (originalUrl: string) => {
    const status = imageStatuses[originalUrl]
    if (!status?.customUrl) return

    if (!isValidImageUrl(status.customUrl)) {
      toast({
        title: 'Invalid URL',
        description: 'Please enter a valid image URL.',
        variant: 'destructive',
      })
      return
    }

    // If this is the cover image, update it separately
    if (originalUrl === coverImageUrl && onCoverImageChange) {
      onCoverImageChange(status.customUrl)
    } else {
      onContentChange(replaceImageUrl(contentRef.current, originalUrl, status.customUrl))
    }

    setImageStatuses((prev) => ({
      ...prev,
      [originalUrl]: { ...prev[originalUrl]!, status: 'done', newUrl: status.customUrl },
    }))
    toast({
      title: 'URL updated',
      description: 'Image URL has been replaced.',
    })
  }

  const pendingCount = originalUrls.filter((url) => imageStatuses[url]?.status === 'pending').length
  const uploadingCount = originalUrls.filter((url) => imageStatuses[url]?.status === 'uploading').length
  const doneCount = originalUrls.filter((url) => imageStatuses[url]?.status === 'done').length
  const allDone = doneCount === originalUrls.length

  // Hide the warning once all images have been re-uploaded
  if (allDone) {
    return (
      <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
        <div className="flex items-center gap-3">
          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-green-700 dark:text-green-400">
              {originalUrls.length === 1 ? 'Image Re-uploaded' : 'Images Re-uploaded'}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {originalUrls.length === 1
                ? 'The image has been re-uploaded to your Blossom account.'
                : `All ${originalUrls.length} images have been re-uploaded to your Blossom account.`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-4 space-y-4">
      {/* Warning Header */}
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-medium text-yellow-700 dark:text-yellow-400">
            Delegate-Provided Images
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            This submission contains {originalUrls.length} image URL{originalUrls.length !== 1 ? 's' : ''} provided by the delegate.
            The delegate can delete these images after publication.
          </p>
        </div>
      </div>

      {/* Options */}
      <RadioGroup
        value={selectedOption}
        onValueChange={(v) => setSelectedOption(v as RehostOption)}
        disabled={disabled}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="trust" id="trust" />
          <Label htmlFor="trust" className="cursor-pointer">
            Trust delegate (use original URLs)
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="reupload" id="reupload" />
          <Label htmlFor="reupload" className="cursor-pointer">
            Re-upload to your Blossom account
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="custom" id="custom" />
          <Label htmlFor="custom" className="cursor-pointer">
            Provide custom URLs
          </Label>
        </div>
      </RadioGroup>

      {/* Re-upload Section */}
      {selectedOption === 'reupload' && (
        <div className="space-y-3 pl-6">
          {pendingCount > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={handleReuploadAll}
              disabled={disabled || uploadingCount > 0}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {uploadingCount > 0 ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Re-uploading...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Re-upload All ({pendingCount})
                </>
              )}
            </Button>
          )}

          <div className="space-y-2">
            {originalUrls.map((url) => {
              const status = imageStatuses[url]
              return (
                <ImageItem
                  key={url}
                  url={url}
                  status={status}
                  mode="reupload"
                  onReupload={() => handleReuploadImage(url)}
                  onUploadFile={(file) => handleUploadFile(url, file)}
                  disabled={disabled}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Custom URL Section */}
      {selectedOption === 'custom' && (
        <div className="space-y-3 pl-6">
          {originalUrls.map((url) => {
            const status = imageStatuses[url]
            return (
              <ImageItemWithCustomUrl
                key={url}
                url={url}
                status={status}
                onCustomUrlChange={(customUrl) => handleCustomUrlChange(url, customUrl)}
                onApply={() => handleApplyCustomUrl(url)}
                disabled={disabled}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

interface ImageItemProps {
  url: string
  status?: ImageStatus
  mode: 'reupload' | 'custom'
  onReupload?: () => void
  onUploadFile?: (file: File) => void
  disabled?: boolean
}

function ImageItem({ url, status, mode, onReupload, onUploadFile, disabled }: ImageItemProps) {
  const [showPreview, setShowPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const displayUrl = status?.newUrl || url
  const shortUrl = displayUrl.length > 50 ? displayUrl.slice(0, 50) + '...' : displayUrl

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onUploadFile) {
      onUploadFile(file)
    }
    // Reset input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="text-sm border rounded p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {status?.status === 'done' ? (
            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
          ) : status?.status === 'uploading' ? (
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          ) : status?.status === 'error' ? (
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          ) : (
            <Link className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="truncate font-mono text-xs">{shortUrl}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Hide' : 'Preview'}
          </Button>
          {mode === 'reupload' && status?.status !== 'done' && (
            <>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={onReupload}
                disabled={disabled || status?.status === 'uploading'}
              >
                Re-upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || status?.status === 'uploading'}
                title="Upload a different image"
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
      {showPreview && (
        <div className="rounded overflow-hidden border">
          <img src={displayUrl} alt="" className="w-full h-auto max-h-48 object-cover" />
        </div>
      )}
      {status?.error && (
        <p className="text-xs text-destructive">{status.error}</p>
      )}
    </div>
  )
}

interface ImageItemWithCustomUrlProps {
  url: string
  status?: ImageStatus
  onCustomUrlChange: (url: string) => void
  onApply: () => void
  disabled?: boolean
}

function ImageItemWithCustomUrl({
  url,
  status,
  onCustomUrlChange,
  onApply,
  disabled,
}: ImageItemWithCustomUrlProps) {
  const [showPreview, setShowPreview] = useState(false)
  const displayUrl = status?.newUrl || url
  const previewUrl = status?.customUrl || displayUrl

  return (
    <div className="text-sm border rounded p-2 space-y-2">
      <div className="flex items-center gap-2">
        {status?.status === 'done' ? (
          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
        ) : (
          <Link className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="truncate font-mono text-xs flex-1">{displayUrl}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? 'Hide' : 'Preview'}
        </Button>
      </div>

      {status?.status !== 'done' && (
        <div className="flex gap-2">
          <Input
            value={status?.customUrl || ''}
            onChange={(e) => onCustomUrlChange(e.target.value)}
            placeholder="Enter custom image URL..."
            className="text-xs h-8"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onApply}
            disabled={disabled || !status?.customUrl}
          >
            Apply
          </Button>
        </div>
      )}

      {showPreview && (
        <div className="rounded overflow-hidden border">
          <img src={previewUrl} alt="" className="w-full h-auto max-h-48 object-cover" />
        </div>
      )}
    </div>
  )
}
