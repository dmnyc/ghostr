import { useEffect } from 'react'
import { User, LogOut, Moon, Sun, Monitor, Settings } from 'lucide-react'
import { GhostrLogo } from '@/components/common/GhostrLogo'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { useAuthStore, pubkeyToNpub } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useNDKStore } from '@/stores/ndkStore'
import { useSettingsStore, applyTheme } from '@/stores/settingsStore'
import { RelayStatus } from '@/components/common/RelayStatus'

export function Header() {
  const { isAuthenticated, user, profile, logout } = useAuthStore()
  const { activeRole, toggleRole, setLoginModalOpen, setCurrentView } = useUIStore()
  const { connectionStatus } = useNDKStore()
  const { theme, setTheme } = useSettingsStore()

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const displayName = profile?.name || (user ? `${pubkeyToNpub(user.pubkey).slice(0, 12)}...` : 'Anonymous')
  const shortNpub = user ? `${pubkeyToNpub(user.pubkey).slice(0, 16)}...` : ''

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <GhostrLogo className="h-12 w-12" />
          <span style={{ fontFamily: '"Press Start 2P", cursive', fontSize: '1.2rem' }}>GHOSTR</span>
        </div>

        <div className="flex items-center gap-4">
          <RelayStatus />

          {isAuthenticated && (
            <div className="flex items-center gap-2">
              <Label htmlFor="role-toggle" className="text-sm text-muted-foreground">
                {activeRole === 'delegate' ? 'Delegate' : 'Publisher'}
              </Label>
              <Switch
                id="role-toggle"
                checked={activeRole === 'admin'}
                onCheckedChange={() => toggleRole()}
              />
            </div>
          )}

          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  {profile?.picture ? (
                    <img
                      src={profile.picture}
                      alt={displayName}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-8 w-8 rounded-full bg-muted p-1" />
                  )}
                  <span className="text-sm font-medium hidden sm:inline max-w-[120px] truncate">
                    {displayName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{displayName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{shortNpub}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  Theme
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'system')}>
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Monitor className="mr-2 h-4 w-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCurrentView('settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={() => setLoginModalOpen(true)}
              disabled={connectionStatus !== 'connected'}
            >
              Login
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
