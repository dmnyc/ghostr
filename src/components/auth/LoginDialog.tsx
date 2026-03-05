import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NIP07Login } from './NIP07Login'
import { BunkerLogin } from './BunkerLogin'
import { NSECLogin } from './NSECLogin'

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Login to Ghostr</DialogTitle>
          <DialogDescription>
            Connect your Nostr identity to start creating or reviewing content.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="extension" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="extension">Extension</TabsTrigger>
            <TabsTrigger value="bunker">Bunker</TabsTrigger>
            <TabsTrigger value="nsec">Private Key</TabsTrigger>
          </TabsList>

          <TabsContent value="extension" className="mt-4">
            <NIP07Login onSuccess={() => onOpenChange(false)} />
          </TabsContent>

          <TabsContent value="bunker" className="mt-4">
            <BunkerLogin onSuccess={() => onOpenChange(false)} />
          </TabsContent>

          <TabsContent value="nsec" className="mt-4">
            <NSECLogin onSuccess={() => onOpenChange(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
