# Ghostr Developer Notes

A Nostr delegation/approval workflow app where delegates draft content and publishers approve and publish it.

## Architecture Overview

### Tech Stack
- **Framework:** React + Vite + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Nostr:** @nostr-dev-kit/ndk
- **State:** Zustand stores

### Key Directories
```
src/
├── components/
│   ├── admin/         # Publisher dashboard components
│   ├── delegate/      # Delegate/writer components
│   ├── common/        # Shared components (editors, inputs)
│   ├── layout/        # Header, Footer, nav
│   └── ui/            # shadcn/ui primitives
├── stores/            # Zustand state management
├── lib/               # Utilities and services
├── hooks/             # React hooks
├── services/          # External service integrations
└── types/             # TypeScript interfaces
```

---

## Zustand Stores

| Store | Purpose |
|-------|---------|
| `authStore` | Authentication state, NIP-07/NSEC login, profile fetching |
| `ndkStore` | NDK instance, relay connections, NIP-65 relay list |
| `draftStore` | Drafts CRUD, NIP-78 persistence (encrypted to self) |
| `submissionStore` | Incoming submissions from delegates (in-memory) |
| `publishHistoryStore` | Published posts history (localStorage persisted) |
| `favoritesStore` | Favorite publishers (NIP-78 encrypted) |
| `settingsStore` | User preferences (default role, credit toggle) |
| `uiStore` | UI state (active role, modals, current view) |

---

## Nostr Protocols Used

### NIP-07 - Browser Extension Auth
- Login via Alby, nos2x, etc.
- Session restore on page reload

### NIP-78 - Application-Specific Data
- **Kind 30078** with d-tag for app data storage
- Used for: drafts, favorites
- Encrypted to self via NIP-44

### NIP-59 - Gift Wrap
- Encrypted message transport for submissions
- Delegate → Publisher submission delivery
- Publisher → Delegate receipt notifications

### NIP-65 - Relay List Metadata
- Fetch user's preferred relays
- Auto-connect to user's relay list on login

### NIP-23 - Long-Form Content
- **Kind 30023** for articles
- Tags: `d` (identifier), `title`, `published_at`, `image` (cover)

---

## Core Workflows

### Delegate Flow
1. Create draft (Kind 1 note or Kind 30023 article)
2. Select target publisher from favorites or search
3. Save draft to NIP-78 (encrypted, synced across devices)
4. Submit for review → sends NIP-59 gift-wrapped message
5. Receive receipt when approved/rejected

### Publisher Flow
1. Inbox receives NIP-59 gift-wrapped submissions
2. Review content in ReviewPane
3. Edit if needed, toggle "Credit Ghostr"
4. Publish → signs with publisher's key
5. Send receipt back to delegate

---

## Key Features

### Profile Search (Primal Cache)
- WebSocket connection to `wss://cache2.primal.net/v1`
- Fast profile search by name, nip05, npub
- LRU cache (100 profiles)
- Used in: publisher selection, @mentions

### @Mentions
- Trigger: `@` + 2 characters
- Autocomplete dropdown with profile search
- Inserts `nostr:npub1...` format
- Works in both short-form and long-form editors

### Favorites (NIP-78)
- Store favorite publishers encrypted to self
- Quick-select in draft editor
- Sync across devices via relays

### Publish History
- Persisted to localStorage
- Tracks both direct posts and approved submissions
- Shows source (direct vs delegate)

---

## Data Types

### Draft
```typescript
interface Draft {
  id: string
  title: string
  content: string
  targetKind: 1 | 30023
  tags: string[][]
  status: 'draft' | 'submitted' | 'published' | 'rejected'
  updatedAt: number
  targetPublisher?: DraftPublisher
  submittedTo?: string
  publishedEventId?: string
  coverImage?: string  // Cover image URL for long-form
}
```

### Submission
```typescript
interface Submission {
  id: string
  delegateNpub: string
  delegatePubkey: string
  content: string
  kind: 1 | 30023
  tags: string[][]
  note: string
  receivedAt: number
  status: 'pending' | 'approved' | 'rejected'
  giftWrapEventId: string
}
```

---

## Default Relays
```typescript
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.mom',
  'wss://relay.nostr.net',
  'wss://purplepag.es',
]
```

---

## Feature: Cover Images (NIP-23)

### Tag Format
```json
["image", "https://example.com/cover.jpg"]
```

### Upload Service
- Blossom protocol via `blossom.nostr.build`
- BUD-05 `/media` endpoint (strips EXIF)
- Fallback to `/upload`
- Auth: `BlossomClient.createUploadAuth(signer, file)`

### Components
- `CoverImageInput` - Upload + URL paste input
- Integrated in DraftEditor and DirectPostEditor (long-form only)
