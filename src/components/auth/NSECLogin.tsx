import { useState } from 'react'
import { AlertTriangle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/authStore'

interface NSECLoginProps {
  onSuccess: () => void
}

export function NSECLogin({ onSuccess }: NSECLoginProps) {
  const { loginWithNSEC, isLoading, error } = useAuthStore()
  const [nsec, setNsec] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleLogin = async () => {
    if (!nsec.trim()) return

    try {
      await loginWithNSEC(nsec.trim())
      setNsec('') // Clear the key from memory
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

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 p-3 text-yellow-600 dark:text-yellow-500">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">For testing only</p>
          <p className="mt-1">
            Entering your private key directly is not recommended for production use.
            Your key is only stored in memory and cleared on logout.
          </p>
        </div>
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
        {isLoading ? 'Logging in...' : 'Login with Private Key'}
      </Button>
    </div>
  )
}
