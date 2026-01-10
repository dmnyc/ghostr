import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initializeBotSigner } from '@/lib/ndk/botSigner'
import { QueryProvider } from '@/providers/QueryProvider'

// Initialize bot signer before React render
initializeBotSigner()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
)
