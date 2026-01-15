# Ghostr Developer Notes

A Nostr delegation/approval workflow app where delegates draft content and publishers approve and publish it.

---

## Architecture Overview

### Tech Stack
- **Framework:** React + Vite + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Nostr:** @nostr-dev-kit/ndk
- **State:** Zustand stores + React Query

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

## State Management Guidelines

### Async vs Sync State

**Rule of thumb:**
- **Async state (React Query)**: Data that needs to be retrieved and awaited
- **Sync state (Zustand)**: Data that can be immediately changed without await

**When to use React Query:**
- Data fetched from relays
- Data fetched from databases or external APIs
- Any data that requires an async operation to retrieve
- Data that benefits from caching, background refetching, and stale-while-revalidate patterns

**When to use Zustand:**
- UI state (modals, sidebars, tabs)
- User preferences and settings
- Authentication state (current user/signer)
- Local-only state that doesn't need server synchronization

**Why this matters:**
- React Query handles loading states, error states, caching, and refetching automatically
- Zustand stores are synchronous and don't have built-in async handling patterns
- Mixing async data into Zustand requires manual loading/error state management
- React Query's `staleTime` and `gcTime` prevent unnecessary refetches

**Current usage in Ghostr:**
- `useAdminInbox`, `useDrafts`, `usePublishHistory` - React Query for relay data
- `useSettingsStore`, `useUIStore`, `useAuthStore` - Zustand for sync state
- `ndkStore` - Zustand for connection state (sync) but consider React Query for relay fetches

**Migration consideration:**
Some stores like `favoritesStore` currently use Zustand for relay data. These could benefit from React Query for better caching and background sync.

---

## 2026-01-12: Fixed Markdown Line Break Rendering

### Issue
Single line breaks in markdown editors were not rendering as line breaks in published posts. When users pressed Enter once between lines, the content would appear on a single line in some Nostr clients.

Example:
```
**There are things out there you don't need to know about**
Agent K, Men In Black
```

Would render as:
```
**There are things out there you don't need to know about** Agent K, Men In Black
```

### Root Cause
Markdown specification treats single newlines (`\n`) as soft breaks that collapse into spaces. To create visible line breaks, you need either:
- Two newlines (`\n\n`) - paragraph break
- Two trailing spaces + newline (`  \n`) - hard line break

Our editors stored single `\n` characters when users pressed Enter, which is correct for storage but needs normalization before publishing to ensure proper rendering across all Nostr clients.

### Solution
Added automatic line break normalization before publishing: convert single `\n` to `\n\n` for proper paragraph breaks in markdown.

**Regex pattern:** `/([^\n])\n([^\n])/g` → `'$1\n\n$2'`

This matches any newline that has non-newline characters on both sides and doubles it.

**Files Changed:**
1. `src/components/admin/PublishDialog.tsx` - Normalize when publishing delegate submissions
2. `src/components/admin/DirectPostEditor.tsx` - Normalize for publisher direct posts (long-form only)
3. `src/components/admin/EditArticleEditor.tsx` - Normalize when editing published articles
4. `src/components/delegate/SubmitDialog.tsx` - Normalize when delegate submits (kind 30023 only)

### Behavior
- **Kind 1 (short notes)**: No normalization - single line breaks are preserved as-is
- **Kind 30023 (long-form articles)**: All single line breaks converted to double line breaks for proper markdown rendering

### Testing
Test with content:
```
**Bold text**
Plain text on next line
```

Should now render with a visible line break between the two lines.

---

## 2026-01-12: Fixed Timestamp Mismatch Between Delegate and Publisher

### Issue
Submission timestamps were inconsistent between delegate and publisher views:
- Delegate saw: "Jan 12, 06:32 PM" (correct - when draft was last updated)
- Publisher saw: "Jan 12, 05:20 PM" (wrong - randomized timestamp)

### Root Cause
NIP-59 gift wrap protocol randomizes timestamps for privacy (within past 2 days) to prevent timing analysis attacks. This is by design in the spec. However, we were using the gift wrap event's `created_at` timestamp to determine when a submission was received, which meant publishers saw a random timestamp instead of the actual submission time.

**The problem:**
1. When delegate submits, we create a gift wrap with `created_at = randomizeTimestamp()` (see `src/lib/nostr/nip59.ts:64`)
2. Publisher receives gift wrap and uses `event.created_at` as the submission timestamp
3. This gives a random time from the past 2 days instead of the actual submission time

### Solution
Added `submittedAt` field to the `SubmissionPayload` to carry the actual submission timestamp separately from the NIP-59 gift wrap metadata.

**Changes:**
1. **Type definition** (`src/types/submission.ts`): Added optional `submittedAt?: number` field to `SubmissionPayload`
2. **Sending** (`src/components/delegate/SubmitDialog.tsx:156`): Include `submittedAt: Math.floor(Date.now() / 1000)` in payload
3. **Receiving** (`src/hooks/useAdminInbox.ts:63`): Use `payload.submittedAt` if available, fall back to `event.created_at` for old submissions

### Backward Compatibility
The `submittedAt` field is optional, so:
- New submissions include accurate timestamp
- Old submissions (without `submittedAt`) fall back to gift wrap timestamp
- No migration needed

### Testing
Verified with test submission "Timestamp test 4":
- Delegate view: Jan 12, 06:32 PM ✅
- Publisher view: Jan 12, 06:32 PM ✅

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
  'wss://purplepag.es',
  'wss://nostr.wine',
  'wss://relay.nos.social',
]
```

---

## Cover Images (NIP-23)

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

---

## Future Enhancements

### Image Paste Support
**Current Behavior:**
- Pasting images directly into `MentionPillTextarea` is blocked
- Shows alert: "Image pasting is not supported. Please use the Upload Image button instead."
- Prevents broken/inaccessible images from being inserted

**Desired Future Behavior:**
- Intercept paste events containing images
- Upload pasted images to Blossom automatically
- Insert the resulting Blossom URL into content
- Show upload progress indicator

**Implementation Notes:**
- Add `onPaste` handler to `MentionPillTextarea`
- Detect `ClipboardEvent.clipboardData.items` with type `image/*`
- Extract image file from clipboard
- Upload to Blossom via `uploadToBlossom(file, signer)`
- Insert resulting URL at cursor position
- Handle upload errors gracefully

**Affected Components:**
- `src/components/common/MentionPillTextarea.tsx`
- `src/lib/blossom.ts` (upload utilities)

### Image URL Visibility in Editors
**Current Behavior:**
- When using the "Upload Image" button, the image URL is appended to the content text
- Both uploaded URLs and pasted URLs appear in the content editor
- Image thumbnails are shown separately below the content

**Desired Behavior:**
- Uploaded image URLs (via Upload Image button) should NOT appear in the content text
- Only manually typed/pasted URLs should be visible in the content editor
- Uploaded images should only appear as thumbnails
- When publishing, all image URLs (uploaded + pasted) should be included in the final content

**Implementation Notes:**
- Track uploaded images separately from pasted URLs using `uploadedImages` array
- Filter out `uploadedImages` from the visible content in the editor
- When publishing or submitting, merge `uploadedImages` back into the content
- DraftEditor already has partial implementation (lines 128-133) that removes uploaded images from display
- Need to extend this pattern to:
  - ReviewPane (publisher review)
  - DirectPostEditor (publisher direct posts)
  - PublishDialog (final content assembly)

**Affected Components:**
- `src/components/delegate/DraftEditor.tsx`
- `src/components/admin/ReviewPane.tsx`
- `src/components/admin/DirectPostEditor.tsx`
- `src/components/admin/PublishDialog.tsx`
- `src/types/draft.ts` (Draft.uploadedImages)
- `src/types/submission.ts` (may need uploadedImages field)
