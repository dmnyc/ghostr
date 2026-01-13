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
- **Draft Management** - Local caching + relay sync via NIP-37
- **Publish History** - Track all published content
- **Favorite Publishers** - Quick access to frequent collaborators
- **Bot Notifications** - Optional cross-client compatible DM notifications
- **Follow Management** - Safe follow/unfollow with automatic data preservation

## Tech Stack

- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- @nostr-dev-kit/ndk
- Zustand for state management
- Blossom for media uploads

## Nostr NIPs Used

- **NIP-01** - Basic protocol (kind 1 notes, kind 3 contacts)
- **NIP-04** - Encrypted DMs (bot notifications)
- **NIP-07** - Browser extension signing
- **NIP-23** - Long-form content (kind 30023)
- **NIP-37** - Draft storage (one event per draft, encrypted)
- **NIP-44** - Encrypted payloads
- **NIP-59** - Gift-wrapped messages for private submissions
- **NIP-65** - Relay list metadata
- **NIP-78** - Application-specific data (publish history, favorites)

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Bot Notifications

Ghostr includes an optional notification bot that sends cross-client compatible DM notifications.

### Why Bot Notifications?

The primary communication method (NIP-59 gift wrap) works perfectly in Ghostr but has limited support in other Nostr clients:
- **Keychat:** Shows notification but not message body
- **Damus/Primal:** No notification at all

The bot sends supplemental NIP-04 encrypted DMs that work across all major clients.

### Setup

1. Generate a new Nostr keypair for your bot (use any key generation tool, or [rana](https://github.com/grunch/rana) for a vanity npub)
2. Create `.env` file with the bot's private key:
   ```env
   VITE_BOT_NSEC=nsec1...your_bot_nsec_here
   ```
3. Rebuild: `npm run build`

### Security

The bot operates client-side and its nsec is included in the application bundle. This is acceptable because:
- Bot only sends notifications (no data access)
- Bot has no special privileges
- Users can disable notifications in settings
- Bot can be muted/blocked like any Nostr user

### Configuration

Users can manage bot notifications in Settings → Notifications:
- Enable/disable bot DM notifications
- View bot profile with avatar and name
- Copy bot npub for use in other clients
- Follow/unfollow the bot directly from settings

### Follow Management

The bot follow feature includes safeguards to prevent accidental data loss:
- Fetches current follow list before making changes
- Preserves all existing follows when adding/removing
- Uses fetch-merge-publish pattern for safety
- Displays current follow state with visual feedback

## Authentication

Ghostr supports NIP-07 browser extensions (Alby, nos2x, etc.) for signing. Your private keys never leave your extension.

**Note:** This application uses **NIP-44** for encryption to ensure modern security standards. It may not work properly with older browser extensions that only support NIP-04 encryption.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built for the Nostr protocol
- From the creator of [Plebs vs. Zombies](https://plebsvszombies.cc) and [Mutable](https://mutable.top)

## Author

- Created by The Daniel⚡️
- Vibed with Claude Code
