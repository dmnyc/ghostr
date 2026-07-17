import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Wifi, WifiOff, BookOpen, Pencil, Copy, Check, UserPlus, UserMinus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSettingsStore } from '@/stores/settingsStore'
import { NOTE_CLIENTS } from '@/lib/nostrClients'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { isBotEnabled, getBotPubkey } from '@/lib/ndk/botSigner'
import { fetchProfile, getDisplayName } from '@/services/profileSearchService'
import { nip19 } from 'nostr-tools'
import type { SearchProfile } from '@/services/profileSearchService'
import { isFollowing, followUser, unfollowUser } from '@/lib/nostr/follows'
import { toast } from '@/hooks/useToast'

export function SettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { connectedRelays, fetchNIP65Relays } = useNDKStore()
  const {
    defaultRole,
    setDefaultRole,
    creditGhostr,
    setCreditGhostr,
    enableBotNotifications,
    setBotNotifications,
    noteViewerClient,
    setNoteViewerClient,
    relays,
    addRelay,
    removeRelay,
    resetToDefaultRelays,
    useNIP65,
    setUseNIP65,
    nip65Relays,
  } = useSettingsStore()

  const [newRelayUrl, setNewRelayUrl] = useState('')
  const [isLoadingNIP65, setIsLoadingNIP65] = useState(false)
  const [botPubkey, setBotPubkey] = useState<string | null>(null)
  const [botProfile, setBotProfile] = useState<SearchProfile | null>(null)
  const [copiedNpub, setCopiedNpub] = useState(false)
  const [isFollowingBot, setIsFollowingBot] = useState(false)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  // Fetch NIP-65 relays on mount if user is logged in
  useEffect(() => {
    if (user && useNIP65) {
      loadNIP65Relays()
    }
  }, [user?.pubkey])

  // Load bot pubkey and profile on mount
  useEffect(() => {
    const loadBotInfo = async () => {
      const pubkey = await getBotPubkey()
      if (pubkey) {
        setBotPubkey(pubkey)
        const profile = await fetchProfile(pubkey)
        if (profile) {
          setBotProfile(profile)
        }
        // Check if user is following the bot
        if (user) {
          try {
            console.log('[SettingsPage] Checking follow status for bot:', pubkey.slice(0, 8))
            const following = await isFollowing(pubkey)
            console.log('[SettingsPage] Is following bot:', following)
            setIsFollowingBot(following)
          } catch (error) {
            console.error('[SettingsPage] Error checking follow status:', error)
          }
        }
      }
    }
    loadBotInfo()
  }, [user])

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

  const normalizeUrl = (url: string) => url.replace(/\/+$/, '')
  const isRelayConnected = (url: string) =>
    connectedRelays.some(r => normalizeUrl(r) === normalizeUrl(url))

  const handleCopyNpub = async () => {
    if (!botPubkey) return
    const npub = nip19.npubEncode(botPubkey)
    await navigator.clipboard.writeText(npub)
    setCopiedNpub(true)
    setTimeout(() => setCopiedNpub(false), 2000)
  }

  const handleToggleFollow = async () => {
    if (!botPubkey || !user) return

    setIsFollowLoading(true)
    try {
      if (isFollowingBot) {
        const success = await unfollowUser(botPubkey)
        if (success) {
          setIsFollowingBot(false)
          toast({
            title: 'Unfollowed',
            description: 'You have unfollowed the Ghostr bot',
          })
        } else {
          toast({
            title: 'Error',
            description: 'Failed to unfollow. Please try again.',
            variant: 'destructive',
          })
        }
      } else {
        const success = await followUser(botPubkey)
        if (success) {
          setIsFollowingBot(true)
          toast({
            title: 'Following',
            description: 'You are now following the Ghostr bot',
          })
        } else {
          toast({
            title: 'Error',
            description: 'Failed to follow. Please try again.',
            variant: 'destructive',
          })
        }
      }
    } catch (error) {
      console.error('[SettingsPage] Follow toggle error:', error)
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsFollowLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
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

      {/* Post Links */}
      <Card>
        <CardHeader>
          <CardTitle>Post Links</CardTitle>
          <CardDescription>Choose which Nostr client opens when you view a published post</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>Open notes in</Label>
            <select
              value={noteViewerClient}
              onChange={(e) => setNoteViewerClient(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {NOTE_CLIENTS.map((client) => (
                <option key={client.key} value={client.key}>{client.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Configure how you receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="bot-notifications">Enable Bot Notifications</Label>
              <p className="text-sm text-muted-foreground">
                Receive DM notifications from the Ghostr bot
                {isBotEnabled() ? ' (Compatible with all Nostr clients)' : ' (Not configured)'}
              </p>
            </div>
            <Switch
              id="bot-notifications"
              checked={enableBotNotifications && isBotEnabled()}
              onCheckedChange={setBotNotifications}
              disabled={!isBotEnabled()}
            />
          </div>

          {botPubkey && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <img
                src={botProfile?.picture || `https://api.dicebear.com/7.x/identicon/svg?seed=${botPubkey}`}
                alt={botProfile?.name || 'Bot'}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${botPubkey}`
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {botProfile ? getDisplayName(botProfile) : 'Ghostr Bot'}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyNpub}
                  className="h-8 px-3 text-xs"
                >
                  {copiedNpub ? (
                    <>
                      <Check className="h-3 w-3 mr-1.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1.5" />
                      Copy npub
                    </>
                  )}
                </Button>
                {user && (
                  <Button
                    variant={isFollowingBot ? "outline" : "default"}
                    size="sm"
                    onClick={handleToggleFollow}
                    disabled={isFollowLoading}
                    className="h-8 px-3 text-xs"
                  >
                    {isFollowLoading ? (
                      'Loading...'
                    ) : isFollowingBot ? (
                      <>
                        <UserMinus className="h-3 w-3 mr-1.5" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3 w-3 mr-1.5" />
                        Follow
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
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
                      className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isRelayConnected(relay.url) ? (
                          <Wifi className="h-4 w-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="text-sm font-mono truncate">{relay.url}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
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
            <Button
              variant="outline"
              onClick={() => {
                resetToDefaultRelays()
                toast({
                  title: 'Reset to defaults',
                  description: 'Relay list has been reset to default relays',
                })
              }}
            >
              Reset
            </Button>
          </div>

          <div className="space-y-2">
            {relays.map((relay) => (
              <div
                key={relay.url}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isRelayConnected(relay.url) ? (
                    <Wifi className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="text-sm font-mono truncate">{relay.url}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRelay(relay.url)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
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
