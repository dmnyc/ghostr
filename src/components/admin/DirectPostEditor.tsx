import { useState } from 'react'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { MarkdownEditor } from '@/components/common/MarkdownEditor'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { toast } from '@/hooks/useToast'
import { NDKEvent } from '@nostr-dev-kit/ndk'

interface DirectPostEditorProps {
  onBack: () => void
  onPublished?: () => void
}

export function DirectPostEditor({ onBack, onPublished }: DirectPostEditorProps) {
  const { ndk } = useNDKStore()
  const { signer } = useAuthStore()
  const { creditGhostr } = useSettingsStore()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isLongForm, setIsLongForm] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)

  const handlePublish = async () => {
    if (!content.trim()) {
      toast({
        title: 'Cannot publish',
        description: 'Please add some content before publishing.',
        variant: 'destructive',
      })
      return
    }

    if (!ndk || !signer) {
      toast({
        title: 'Not connected',
        description: 'Please ensure you are logged in and connected to relays.',
        variant: 'destructive',
      })
      return
    }

    setIsPublishing(true)

    try {
      const event = new NDKEvent(ndk)
      event.kind = isLongForm ? 30023 : 1
      event.content = content

      const tags: string[][] = []

      if (isLongForm) {
        // Add NIP-23 tags for long-form content
        const slug = title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')

        tags.push(
          ['d', slug || `post-${Date.now()}`],
          ['title', title],
          ['published_at', Math.floor(Date.now() / 1000).toString()]
        )
      }

      // Add client tag if enabled
      if (creditGhostr) {
        tags.push(['client', 'Ghostr'])
      }

      event.tags = tags

      await event.sign(signer)
      await event.publish()

      toast({
        title: 'Published!',
        description: 'Your post has been published to Nostr.',
      })

      // Reset form
      setTitle('')
      setContent('')

      onPublished?.()
      onBack()
    } catch (err) {
      console.error('Failed to publish:', err)
      toast({
        title: 'Failed to publish',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      })
    } finally {
      setIsPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">New Post</h1>
            <p className="text-sm text-muted-foreground">
              Publish directly to Nostr
            </p>
          </div>
        </div>

        <Button onClick={handlePublish} disabled={isPublishing}>
          {isPublishing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          {isPublishing ? 'Publishing...' : 'Publish'}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {isLongForm && (
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter a title for your article"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            {isLongForm ? (
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Write your article here..."
              />
            ) : (
              <Textarea
                id="content"
                placeholder="What do you want to say?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px]"
              />
            )}
            <p className="text-xs text-muted-foreground">
              {content.length} characters
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-4">
            <h3 className="font-medium">Post Type</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="kind-toggle">Long-form Article</Label>
                <p className="text-xs text-muted-foreground">
                  Kind {isLongForm ? '30023' : '1'}
                </p>
              </div>
              <Switch
                id="kind-toggle"
                checked={isLongForm}
                onCheckedChange={setIsLongForm}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {isLongForm
                ? 'Long-form articles (NIP-23) support markdown and are best for blog posts and articles.'
                : 'Short notes (Kind 1) are like tweets - brief updates and thoughts.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
