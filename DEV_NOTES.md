# Ghostr Developer Notes

A Nostr delegation/approval workflow app where delegates draft content and publishers approve and publish it.

---

## Version History

### v0.6.0 (2026-01-11)

**Draft Editor Enhancements**

- **Delete Draft Feature**
  - Added delete button to draft editor header (for drafts with `status === 'draft'`)
  - Added delete button to draft cards in list view
  - Upgraded delete confirmation from `window.confirm()` to shadcn/ui AlertDialog
  - Consistent confirmation dialog across DraftCard, RejectedList, and DraftEditor
  - Toast notifications on successful deletion
  - Deletes from both localStorage and Nostr relays (NIP-37 deletion marker)

- **Auto-save Optimization**
  - Implemented two-tier debounce system:
    - Local save (1s): Zustand store + localStorage for instant UI feedback
    - Relay save (3s): Publishes to Nostr relays, reducing relay writes by 67%
  - Follows industry standards (Damus uses 3s, Amethyst uses similar patterns)
  - Prevents relay spam while maintaining responsive UX

- **Relay Sync Indicator**
  - Added "Saved to relays" indicator with circular arrow icon (RefreshCw)
  - Appears in editor header after successful relay save
  - Provides clear feedback that draft has been persisted to Nostr network
  - Only visible for drafts with `status === 'draft'`

- **Image URL Link Previews**
  - Image URLs now show as link previews with placeholder icon
  - Avoids CORS issues, loading failures, and timeouts
  - Shows filename and "Image file" label
  - Click to open in new tab
  - Complements existing image upload button (which shows thumbnails)
  - Two ways to add images: Upload button (thumbnails) or paste URL (link preview)

**Files Modified:**
- `src/components/delegate/DraftEditor.tsx` - Delete button, auto-save, relay indicator, image URL handling
- `src/components/delegate/DraftCard.tsx` - AlertDialog confirmation for delete
- `src/components/delegate/RejectedList.tsx` - AlertDialog confirmation for delete
- `src/components/common/LinkPreviewCard.tsx` - Image URL placeholder with click-to-open
- `src/lib/urlUtils.ts` - URL detection and categorization

---

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
| `draftStore` | Drafts CRUD, NIP-37 persistence + local caching |
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

### NIP-37 - Draft Storage
- **Kind 31234** (parameterized replaceable)
- One event per draft with d-tag = draft UUID
- Content encrypted to self via NIP-44
- Local caching in localStorage for instant load
- Background sync with relays

### NIP-78 - Application-Specific Data
- **Kind 30078** with d-tag for app data storage
- Used for: publish history, favorites
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
3. Save draft to NIP-37 (encrypted, cached locally, synced to relays)
4. Submit for review → sends NIP-59 gift-wrapped message
5. Receive receipt when approved/rejected (matched by lastSubmissionId)
6. Dismissed rejection notifications, resubmit after edits

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
  lastSubmissionId?: string  // UUID for matching receipts
  publishedEventId?: string
  rejectionReason?: string
  coverImage?: string
  archived?: boolean
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
