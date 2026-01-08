import { useState } from 'react'
import { Github, Zap, User } from 'lucide-react'
import packageJson from '../../../package.json'

export function Footer() {
  const [zapModal, setZapModal] = useState({
    show: false,
    lightningAddress: 'ghostr@breez.tips',
    qrCode: '',
  })

  const version = packageJson.version
  const creatorNpub =
    'npub1gh0strl6djhzj2h7rcvzx7x902uc5esdd7gwhkv4599aqz8m4pys8ryan3'

  const showZapModal = () => {
    const lightningAddress = zapModal.lightningAddress
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('lightning:' + lightningAddress)}`

    setZapModal({
      ...zapModal,
      qrCode,
      show: true,
    })
  }

  const closeZapModal = () => {
    setZapModal({
      ...zapModal,
      show: false,
    })
  }

  const copyLightningAddress = () => {
    navigator.clipboard.writeText(zapModal.lightningAddress).catch((err) => {
      console.error('Failed to copy Lightning address:', err)
    })
  }

  const zapOnNostr = () => {
    window.open(`https://jumble.social/users/${creatorNpub}`, '_blank')
  }

  return (
    <>
      <footer className="mt-auto py-6 bg-background border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm text-center lg:text-left">
              <span className="block sm:inline">Ghostr v{version}</span>
              <span className="hidden sm:inline"> | </span>
              <span className="block sm:inline">
                Made with 👻 for the Nostr community
              </span>
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <a
                href={`https://jumble.social/users/${creatorNpub}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full transition-colors inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <User size={14} />
                Follow on Nostr
              </a>
              <button
                onClick={showZapModal}
                className="text-xs px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black rounded-full transition-colors inline-flex items-center gap-1.5 font-medium"
              >
                <Zap size={14} />
                Zap Creator
              </button>
              <a
                href="https://github.com/dmnyc/ghostr/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground rounded-full transition-colors inline-flex items-center gap-1.5"
              >
                <Github size={14} />
                Report Issue
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Zap Modal */}
      {zapModal.show && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeZapModal}
        >
          <div
            className="bg-background rounded-lg p-6 max-w-md w-full border"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-yellow-500 flex items-center gap-2">
                <Zap size={20} />
                Zap the Creator
              </h3>
              <button
                onClick={closeZapModal}
                className="text-muted-foreground hover:text-foreground text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="text-center space-y-4">
              <div className="text-muted-foreground">
                Show your appreciation for Ghostr!
              </div>

              {/* QR Code */}
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-lg border-2">
                  <img
                    src={zapModal.qrCode}
                    alt="Lightning Address QR Code"
                    className="w-48 h-48"
                  />
                </div>
              </div>

              {/* Lightning Address */}
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Lightning Address:
                </div>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-3 py-2 rounded text-yellow-500 text-sm flex-grow text-center border">
                    {zapModal.lightningAddress}
                  </code>
                  <button
                    onClick={copyLightningAddress}
                    className="bg-muted hover:bg-muted/80 px-3 py-2 rounded transition-colors"
                    title="Copy Lightning Address"
                  >
                    📋
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={zapOnNostr}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  Zap on Nostr
                </button>
                <button
                  onClick={closeZapModal}
                  className="flex-1 bg-muted hover:bg-muted/80 text-muted-foreground px-4 py-2 rounded-lg transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
