import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, LogOut, Moon, Sun, Monitor, Settings } from 'lucide-react'
import { GhostNoteIcon } from '@/components/common/GhostNoteIcon'
import { GhostrLogo } from '@/components/common/GhostrLogo'
import { Button } from '@/components/ui/button'
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
import { useUnreadGhostNoteCount } from '@/stores/ghostNoteStore'
import { RelayStatus } from '@/components/common/RelayStatus'
import { cn } from '@/lib/utils/cn'

export function Header() {
  const navigate = useNavigate()
  const { isAuthenticated, user, profile, logout } = useAuthStore()
  const { activeRole, setActiveRole, setLoginModalOpen } = useUIStore()
  const { connectionStatus } = useNDKStore()
  const { theme, setTheme } = useSettingsStore()
  const unreadGhostNotes = useUnreadGhostNoteCount()
  const [ghostAnimating, setGhostAnimating] = useState(false)

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const handleLogoClick = () => {
    // Toggle animation on touch devices
    setGhostAnimating((prev) => !prev)
    navigate('/dashboard')
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const displayName = profile?.name || (user ? `${pubkeyToNpub(user.pubkey).slice(0, 12)}...` : 'Anonymous')
  const shortNpub = user ? `${pubkeyToNpub(user.pubkey).slice(0, 16)}...` : ''

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-20 items-center justify-between px-4">
        <button
          onClick={handleLogoClick}
          className="ghost-trigger flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity"
        >
          <GhostrLogo className={cn(
            "h-8 w-8 sm:h-12 sm:w-12 ghost-float",
            ghostAnimating && "ghost-float-active"
          )} />
          <span
            className="text-sm sm:text-lg"
            style={{ fontFamily: '"Press Start 2P", cursive' }}
          >
            GHOS<span style={{ marginLeft: '-0.15em' }}>TR</span>
          </span>
        </button>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Role switcher - tabbed interface */}
          {isAuthenticated && (
            <div className="flex items-center bg-muted rounded-full p-1">
              <button
                onClick={() => {
                  setActiveRole('delegate')
                  navigate('/dashboard')
                }}
                className={cn(
                  'px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-colors',
                  activeRole === 'delegate'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Delegate
              </button>
              <button
                onClick={() => {
                  setActiveRole('admin')
                  navigate('/dashboard')
                }}
                className={cn(
                  'px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-colors',
                  activeRole === 'admin'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Publisher
              </button>
            </div>
          )}

          {/* Ghost Notes Button */}
          {isAuthenticated && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/ghost-notes')}
              className="relative"
              title="Ghost Notes"
            >
              <GhostNoteIcon className="h-5 w-5" />
              {unreadGhostNotes > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full">
                  {unreadGhostNotes > 9 ? '9+' : unreadGhostNotes}
                </span>
              )}
            </Button>
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

                <div className="px-2 py-1.5">
                  <RelayStatus />
                </div>
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
                <DropdownMenuItem onClick={() => navigate('/ghost-notes')}>
                  <GhostNoteIcon className="mr-2 h-4 w-4" />
                  Ghost Notes
                  {unreadGhostNotes > 0 && (
                    <span className="ml-auto bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                      {unreadGhostNotes}
                    </span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
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
