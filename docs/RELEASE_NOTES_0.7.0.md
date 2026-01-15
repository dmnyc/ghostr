# Ghostr v0.7.0 Release Notes

## New Features

### Ghost Notes - Ephemeral Encrypted Messaging

Ghost Notes is a new privacy-focused messaging feature that allows users to send encrypted, self-destructing messages to other Nostr users.

**Key Features:**

- **One-time read**: Messages can only be viewed once, then the content is cleared
- **Auto-expiration**: Notes automatically expire after a configurable time (1 hour to 7 days)
- **Revocable**: Senders can revoke unread messages at any time
- **Direct link sharing**: Share notes via unique URLs (`/note/{dTag}`)
- **End-to-end encryption**: Uses NIP-44 encryption for secure messaging
- **Read receipts**: Senders can see when their notes have been read

**How it works:**

1. Navigate to Ghost Notes from the header menu
2. Compose a message and select a recipient
3. Choose expiration time
4. Send and share the unique link with the recipient
5. Recipient opens link, authenticates, and views the message once

**Privacy features:**

- Archived notes (read/revoked/expired) display no recipient metadata
- Local storage is user-scoped (multi-account safe)
- Content is cleared from memory after viewing

## Bug Fixes

### Kind 1 Note Editor

- **Fixed paste formatting**: Pasting text now strips all formatting (colors, fonts, styles) and inserts plain text only
- **Fixed word wrapping on mobile**: Long words now wrap properly at word boundaries instead of breaking mid-character
- **Fixed double spaces after mentions**: Removed automatic space insertion after @mention pills - users now type the space themselves, preventing double spaces

### Navigation

- **Fixed role switcher navigation**: Clicking Delegate/Publisher buttons in the header now properly navigates to `/dashboard` when on other pages (like Ghost Notes)

### Ghost Notes UI

- **Fixed spinner on empty state**: The "Received" tab no longer shows an infinite spinner when there are no notes
- **Fixed revoke dialog HTML nesting**: Resolved console error about invalid `<p>` nesting in AlertDialogDescription
- **Added compact archived notes view**: Read, revoked, and expired notes now display in a minimal format with collapsible sections

## Technical Details

- New event kind: 30079 (Ghost Note)
- Uses NIP-44 encryption
- Stores metadata in local storage with user scoping
- Direct URL routing: `/note/:dTag`

## Files Changed

**New files:**
- `src/components/ghostNote/` - Ghost Note UI components
- `src/components/common/GhostNoteIcon.tsx` - Custom ghost icon
- `src/lib/nostr/ghostNote.ts` - Ghost Note Nostr utilities
- `src/stores/ghostNoteStore.ts` - Zustand store for Ghost Notes
- `src/types/ghostNote.ts` - TypeScript types

**Modified files:**
- `src/App.tsx` - Added Ghost Note routes
- `src/components/layout/Header.tsx` - Added Ghost Notes nav link, fixed role switcher
- `src/components/common/MentionPillTextarea.tsx` - Fixed paste, word wrap, and mention spacing
- `src/stores/uiStore.ts` - Added Ghost Notes page state
