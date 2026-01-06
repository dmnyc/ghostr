import { useEffect } from 'react'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { initializeTheme } from '@/stores/settingsStore'
import { Header } from '@/components/layout/Header'
import { DelegateDashboard } from '@/components/delegate/DelegateDashboard'
import { PublisherDashboard } from '@/components/admin/PublisherDashboard'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { LoginDialog } from '@/components/auth/LoginDialog'
import { Toaster } from '@/components/ui/toaster'

function App() {
  const { initialize, connectionStatus } = useNDKStore()
  const { isAuthenticated, restoreSession } = useAuthStore()
  const { activeRole, currentView, initializeRole, isLoginModalOpen, setLoginModalOpen } = useUIStore()

  // Initialize theme and role from persisted settings
  useEffect(() => {
    initializeTheme()
    initializeRole()
  }, [initializeRole])

  useEffect(() => {
    initialize()
  }, [initialize])

  // Restore session after NDK connects
  useEffect(() => {
    if (connectionStatus === 'connected') {
      restoreSession()
    }
  }, [connectionStatus, restoreSession])

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-6">
        {connectionStatus === 'connecting' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Connecting to relays...</div>
          </div>
        )}

        {connectionStatus === 'connected' && !isAuthenticated && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <h2 className="text-2xl font-semibold">Welcome to Ghostr</h2>
            <p className="text-muted-foreground text-center max-w-md">
              A decentralized content approval workflow for Nostr.
              Delegates draft content, Admins review and publish.
            </p>
            <button
              onClick={() => setLoginModalOpen(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Login to Get Started
            </button>
          </div>
        )}

        {connectionStatus === 'connected' && isAuthenticated && currentView === 'settings' && (
          <SettingsPage />
        )}

        {connectionStatus === 'connected' && isAuthenticated && currentView === 'main' && (
          activeRole === 'delegate' ? <DelegateDashboard /> : <PublisherDashboard />
        )}

        {connectionStatus === 'error' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-destructive">Failed to connect to relays. Please refresh.</div>
          </div>
        )}
      </main>

      <LoginDialog
        open={isLoginModalOpen}
        onOpenChange={setLoginModalOpen}
      />
      <Toaster />
    </div>
  )
}

export default App
