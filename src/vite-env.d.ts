/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOT_NSEC?: string
  // Add other env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
