import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface ShortNoteLengthWarningProps {
  content: string
  dismissed: boolean
  onDismiss: () => void
  onConvert: () => void
  /** Character count that triggers the warning. */
  threshold?: number
  className?: string
}

/**
 * Nudge shown when a short note grows past `threshold` characters, suggesting a
 * switch to long-form. Dismissal is owned by the parent (composer) so it
 * survives Write/Preview and short↔long toggles, and only resets when the
 * editor is closed and reopened.
 */
export function ShortNoteLengthWarning({
  content,
  dismissed,
  onDismiss,
  onConvert,
  threshold = 2000,
  className,
}: ShortNoteLengthWarningProps) {
  if (dismissed || content.length < threshold) return null

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-2.5 text-sm',
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-foreground">
          This is getting long for a short note ({content.length.toLocaleString('en-US')}{' '}
          characters). Convert it to a long-form article instead?
        </p>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" onClick={onConvert}>
            Convert to article
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>
            Keep as note
          </Button>
        </div>
      </div>
    </div>
  )
}
