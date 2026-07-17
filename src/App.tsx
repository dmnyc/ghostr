import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { useNDKStore } from '@/stores/ndkStore'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { initializeTheme } from '@/stores/settingsStore'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { GhostrLogo } from '@/components/common/GhostrLogo'
import { Footer } from '@/components/layout/Footer'
import { DelegateDashboard } from '@/components/delegate/DelegateDashboard'
import { PublisherDashboard } from '@/components/admin/PublisherDashboard'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { LoginDialog } from '@/components/auth/LoginDialog'
import { GhostNotesPage, GhostNoteViewer } from '@/components/ghostNote'
import { WhatsNewDialog } from '@/components/common/WhatsNewDialog'
import { Toaster } from '@/components/ui/toaster'
import { APP_VERSION, getLastSeenReleaseVersion } from '@/data/releaseNotes'

// Landing page for unauthenticated users
function LandingPage() {
  const { setLoginModalOpen } = useUIStore()

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <GhostrLogo className="h-24 w-24 ghost-float-always" />
      <h2 className="text-2xl font-semibold">Welcome to Ghostr</h2>
      <p className="text-muted-foreground text-center max-w-md">
        A decentralized content delegation workflow for Nostr.
        Writers draft, publishers sign. No scary key sharing required.
      </p>
      <Button size="lg" onClick={() => setLoginModalOpen(true)}>
        Login to Get Started
      </Button>
    </div>
  )
}

// Dashboard page (delegate or publisher based on role)
function DashboardPage() {
  const { activeRole } = useUIStore()
  return activeRole === 'delegate' ? <DelegateDashboard /> : <PublisherDashboard />
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const { connectionStatus } = useNDKStore()

  if (connectionStatus !== 'connected') {
    return null // Will show connecting state from parent
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  const { initialize, connectionStatus } = useNDKStore()
  const { isAuthenticated, restoreSession } = useAuthStore()
  const { initializeRole, isLoginModalOpen, setLoginModalOpen, setWhatsNewOpen } = useUIStore()

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

  // Show "What's New" when the app version changes (signed-in users only)
  useEffect(() => {
    if (isAuthenticated && getLastSeenReleaseVersion() !== APP_VERSION) {
      setWhatsNewOpen(true)
    }
  }, [isAuthenticated, setWhatsNewOpen])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="container mx-auto px-4 py-6 flex-1">
        {connectionStatus === 'connecting' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Connecting to relays...</div>
          </div>
        )}

        {connectionStatus === 'error' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-destructive">Failed to connect to relays. Please refresh.</div>
          </div>
        )}

        {connectionStatus === 'connected' && (
          <Routes>
            {/* Public route - landing or redirect to dashboard */}
            <Route
              path="/"
              element={
                isAuthenticated ? <Navigate to="/dashboard" replace /> : <LandingPage />
              }
            />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/ghost-notes"
              element={
                <ProtectedRoute>
                  <GhostNotesPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/ghost-notes/:tab"
              element={
                <ProtectedRoute>
                  <GhostNotesPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Ghost Note direct link - not protected, shows login prompt */}
            <Route path="/note/:dTag" element={<GhostNoteViewer />} />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>

      <Footer />

      <LoginDialog
        open={isLoginModalOpen}
        onOpenChange={setLoginModalOpen}
      />
      <WhatsNewDialog />
      <Toaster />
      <Analytics />
    </div>
  )
}

export default App
