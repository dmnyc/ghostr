# Development Notes

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
