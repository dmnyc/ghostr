import { Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUIStore } from '@/stores/uiStore'
import { APP_VERSION, releaseNotes, setLastSeenReleaseVersion } from '@/data/releaseNotes'

/**
 * "What's New" release-notes dialog. Opens automatically when the app version
 * changes (driven from App), dismissable, and reachable again from the footer.
 * Dismissing records the current version so it won't re-show until the next
 * release.
 */
export function WhatsNewDialog() {
  const open = useUIStore((s) => s.whatsNewOpen)
  const setWhatsNewOpen = useUIStore((s) => s.setWhatsNewOpen)

  const handleOpenChange = (next: boolean) => {
    setWhatsNewOpen(next)
    if (!next) setLastSeenReleaseVersion(APP_VERSION)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span aria-hidden="true">👻</span>
            What's New
          </DialogTitle>
          <DialogDescription>Recent updates to Ghostr.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {releaseNotes.map((release) => (
            <div key={release.version}>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">v{release.version}</h3>
                <span className="text-xs text-muted-foreground">{release.date}</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {release.highlights.map((highlight, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-primary" />
                    <span className="text-muted-foreground">{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
