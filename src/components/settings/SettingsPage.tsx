import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2, Wifi, WifiOff, BookOpen, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'

export function SettingsPage() {
  const { setCurrentView } = useUIStore()
  const { user } = useAuthStore()
  const { connectedRelays, fetchNIP65Relays } = useNDKStore()
  const {
    defaultRole,
    setDefaultRole,
    creditGhostr,
    setCreditGhostr,
    relays,
    addRelay,
    removeRelay,
    useNIP65,
    setUseNIP65,
    nip65Relays,
  } = useSettingsStore()

  const [newRelayUrl, setNewRelayUrl] = useState('')
  const [isLoadingNIP65, setIsLoadingNIP65] = useState(false)

  // Fetch NIP-65 relays on mount if user is logged in
  useEffect(() => {
    if (user && useNIP65) {
      loadNIP65Relays()
    }
  }, [user?.pubkey])

  const loadNIP65Relays = async () => {
    if (!user) return
    setIsLoadingNIP65(true)
    try {
      await fetchNIP65Relays(user.pubkey)
    } finally {
      setIsLoadingNIP65(false)
    }
  }

  const handleAddRelay = () => {
    if (!newRelayUrl.trim()) return
    let url = newRelayUrl.trim()
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      url = 'wss://' + url
    }
    addRelay(url)
    setNewRelayUrl('')
  }

  const isRelayConnected = (url: string) => connectedRelays.includes(url)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setCurrentView('main')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      {/* Default Role */}
      <Card>
        <CardHeader>
          <CardTitle>Default Role</CardTitle>
          <CardDescription>
            Choose which role to start with when you open Ghostr
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Start as Publisher</Label>
              <p className="text-sm text-muted-foreground">
                {defaultRole === 'admin' ? 'You will start in Publisher mode' : 'You will start in Delegate mode'}
              </p>
            </div>
            <Switch
              checked={defaultRole === 'admin'}
              onCheckedChange={(checked) => setDefaultRole(checked ? 'admin' : 'delegate')}
            />
          </div>
        </CardContent>
      </Card>

      {/* Publishing Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Publishing</CardTitle>
          <CardDescription>
            Configure how posts are published
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Credit Ghostr in posts</Label>
              <p className="text-sm text-muted-foreground">
                Add a "client" tag to published events identifying Ghostr as the publishing app
              </p>
            </div>
            <Switch
              checked={creditGhostr}
              onCheckedChange={setCreditGhostr}
            />
          </div>
        </CardContent>
      </Card>

      {/* NIP-65 Relays */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Your Announced Relays (NIP-65)
          </CardTitle>
          <CardDescription>
            These are the relays you've announced in your Nostr profile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Use NIP-65 Relays</Label>
              <p className="text-sm text-muted-foreground">
                Prefer your announced relays over manual configuration
              </p>
            </div>
            <Switch checked={useNIP65} onCheckedChange={setUseNIP65} />
          </div>

          {useNIP65 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Your NIP-65 Relays</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadNIP65Relays}
                  disabled={isLoadingNIP65 || !user}
                >
                  {isLoadingNIP65 ? 'Loading...' : 'Refresh'}
                </Button>
              </div>

              {nip65Relays.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {user ? 'No NIP-65 relays found. Publish a relay list (kind 10002) to use this feature.' : 'Log in to fetch your relay list.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {nip65Relays.map((relay) => (
                    <div
                      key={relay.url}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {isRelayConnected(relay.url) ? (
                          <Wifi className="h-4 w-4 text-green-500" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm font-mono">{relay.url}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {relay.read && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3 w-3" /> Read
                          </span>
                        )}
                        {relay.write && (
                          <span className="flex items-center gap-1">
                            <Pencil className="h-3 w-3" /> Write
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual Relay Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Relay Configuration</CardTitle>
          <CardDescription>
            {useNIP65 && nip65Relays.length > 0
              ? 'These are used as fallback when NIP-65 relays are unavailable'
              : 'Configure which relays to connect to'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="wss://relay.example.com"
              value={newRelayUrl}
              onChange={(e) => setNewRelayUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddRelay()}
            />
            <Button onClick={handleAddRelay} size="icon">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-2">
            {relays.map((relay) => (
              <div
                key={relay.url}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {isRelayConnected(relay.url) ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-mono">{relay.url}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRelay(relay.url)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
