# Ghostr

**Dead simple post delegation.**

Ghostr is a secure delegation workflow for Nostr. Writers draft content, publishers approve and sign—no scary key sharing required.

## How It Works

Ghostr enables two roles:

**Delegates (Writers)**
- Create and edit drafts (short notes or long-form articles)
- Upload images to Blossom media servers
- Submit drafts to a publisher for approval
- Receive notifications when posts are approved or rejected
- Resubmit rejected posts after revisions
- Archive submitted drafts to reduce clutter

**Publishers (Admins)**
- Receive submissions in a private inbox
- Review, edit, approve, or reject content
- Preview and re-host delegate images to your own Blossom account
- Publish approved content signed with your own keys
- Post directly without the approval workflow
- Track publish history (persisted to relays)

All communication between delegates and publishers uses encrypted gift-wrapped messages (NIP-59), so submissions stay private.

## Features

- **Kind 1 Notes** - Short posts like tweets
- **Kind 30023 Articles** - Long-form markdown content with cover images
- **Image Upload** - Upload to Blossom servers with preview
- **Image Re-hosting** - Publishers can re-upload delegate images
- **Draft Management** - Local drafts synced to relays via NIP-78
- **Publish History** - Track all published content
- **Favorite Publishers** - Quick access to frequent collaborators

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- @nostr-dev-kit/ndk
- Zustand for state management
- Blossom for media uploads

## Nostr NIPs Used

- **NIP-01** - Basic protocol (kind 1 notes)
- **NIP-07** - Browser extension signing
- **NIP-23** - Long-form content (kind 30023)
- **NIP-44** - Encrypted payloads
- **NIP-59** - Gift-wrapped messages for private submissions
- **NIP-65** - Relay list metadata
- **NIP-78** - Application-specific data (draft & history storage)

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

**Note:** This application uses **NIP-44** for encryption to ensure modern security standards. It may not work properly with older browser extensions that only support NIP-04 encryption.

## License

MIT
