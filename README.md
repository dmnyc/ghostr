# Ghostr

**Dead simple post delegation.**

Ghostr is a secure delegation workflow for Nostr. Writers draft content, publishers approve and sign—no scary key sharing required.

## How It Works

Ghostr enables two roles:

**Delegates (Writers)**
- Create and edit drafts locally
- Submit drafts to a publisher for approval
- Receive notifications when posts are approved or rejected
- Resubmit rejected posts after revisions

**Publishers (Admins)**
- Receive submissions in a private inbox
- Review, edit, approve, or reject content
- Publish approved content signed with their own keys
- Post directly without the approval workflow

All communication between delegates and publishers uses encrypted gift-wrapped messages (NIP-59), so submissions stay private.

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- @nostr-dev-kit/ndk
- Zustand for state management

## Nostr NIPs Used

- **NIP-01** - Basic protocol (kind 1 notes)
- **NIP-07** - Browser extension signing
- **NIP-23** - Long-form content (kind 30023)
- **NIP-44** - Encrypted payloads
- **NIP-59** - Gift-wrapped messages for private submissions
- **NIP-65** - Relay list metadata
- **NIP-78** - Application-specific data (draft storage)

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Authentication

Ghostr supports NIP-07 browser extensions (Alby, nos2x, etc.) for signing. Your private keys never leave your extension.

## License

MIT
