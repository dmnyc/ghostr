import { Wifi, WifiOff, Loader2 } from 'lucide-react'
import { useNDKStore } from '@/stores/ndkStore'

export function RelayStatus() {
  const { connectionStatus, connectedRelays } = useNDKStore()

  if (connectionStatus === 'connecting') {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs hidden sm:inline">Connecting...</span>
      </div>
    )
  }

  if (connectionStatus === 'error' || connectionStatus === 'disconnected') {
    return (
      <div className="flex items-center gap-1 text-destructive">
        <WifiOff className="h-4 w-4" />
        <span className="text-xs hidden sm:inline">Disconnected</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 text-green-500">
      <Wifi className="h-4 w-4" />
      <span className="text-xs hidden sm:inline">
        {connectedRelays.length} relay{connectedRelays.length !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
