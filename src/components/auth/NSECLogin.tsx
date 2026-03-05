import { useState } from 'react'
import { AlertCircle, Eye, EyeOff, Copy, Check, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools'

interface NSECLoginProps {
  onSuccess: () => void
}

export function NSECLogin({ onSuccess }: NSECLoginProps) {
  const { loginWithNSEC, isLoading, error } = useAuthStore()
  const [nsec, setNsec] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [generated, setGenerated] = useState<{
    nsec: string
    npub: string
  } | null>(null)
  const [showGenerated, setShowGenerated] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleLogin = async () => {
    if (!nsec.trim()) return

    try {
      await loginWithNSEC(nsec.trim())
      setNsec('')
      onSuccess()
    } catch {
      // Error is handled in the store
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin()
    }
  }

  const handleGenerate = () => {
    const sk = generateSecretKey()
    const pk = getPublicKey(sk)
    setGenerated({
      nsec: nip19.nsecEncode(sk),
      npub: nip19.npubEncode(pk),
    })
    setShowGenerated(false)
  }

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleDownload = () => {
    if (!generated) return
    const content = `Ghostr Private Key Backup\nnpub: ${generated.npub}\nnsec: ${generated.nsec}\n`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ghostr-backup.txt'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleGeneratedLogin = async () => {
    if (!generated) return
    try {
      await loginWithNSEC(generated.nsec)
      setGenerated(null)
      onSuccess()
    } catch {
      // Error is handled in the store
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <p>
          Enter your private key directly. Your key is only stored in memory and
          cleared on logout.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nsec">Private Key (nsec or hex)</Label>
        <div className="relative">
          <Input
            id="nsec"
            type={showKey ? 'text' : 'password'}
            placeholder="nsec1..."
            value={nsec}
            onChange={(e) => setNsec(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <Button
        onClick={handleLogin}
        disabled={isLoading || !nsec.trim()}
        className="w-full"
      >
        {isLoading && !generated ? 'Logging in...' : 'Login with Private Key'}
      </Button>

      {!generated ? (
        <button
          type="button"
          onClick={handleGenerate}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          New to Nostr? Generate a key
        </button>
      ) : (
        <div className="space-y-3 rounded-md border border-muted p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Public Key</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={generated.npub}
                className="text-xs font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => handleCopy(generated.npub, 'npub')}
              >
                {copiedField === 'npub' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Private Key</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  readOnly
                  type={showGenerated ? 'text' : 'password'}
                  value={generated.nsec}
                  className="pr-10 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGenerated(!showGenerated)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showGenerated ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => handleCopy(generated.nsec, 'nsec')}
              >
                {copiedField === 'nsec' ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="w-full"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Backup
          </Button>

          <Button
            onClick={handleGeneratedLogin}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Logging in...' : "I've saved my key — Log in"}
          </Button>
        </div>
      )}
    </div>
  )
}
