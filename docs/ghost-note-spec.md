# Ghost Note - Feature Specification
## Ephemeral Encrypted Secrets for Ghostr

**Version:** 1.0  
**Date:** January 14, 2026  
**Status:** Ready for Implementation

---

## Table of Contents
1. [Overview](#overview)
2. [Core Principles](#core-principles)
3. [Event Structure](#event-structure)
4. [Database Schema](#database-schema)
5. [Feature Components](#feature-components)
6. [Implementation Checklist](#implementation-checklist)
7. [Key Functions Reference](#key-functions-reference)
8. [Error Handling](#error-handling)
9. [Security Considerations](#security-considerations)
10. [User Education](#user-education)

---

## Overview

Ghost Note is an ephemeral encrypted secret sharing feature for Ghostr. Secrets are encrypted with NIP-44 between sender and recipient. The sender maintains full control and can revoke access at any time. An optional notification system alerts the sender when the note is read.

### Key Features
- End-to-end encryption using NIP-44
- Sender-controlled revocation
- Automatic expiration (NIP-40)
- Optional read receipts
- No recipient action required for deletion

---

## Core Principles

1. **Sender control**: Only the sender can delete/revoke notes
2. **Simple expiration**: All notes have expiration timestamps (NIP-40)
3. **Optional notifications**: Recipient can notify sender when read
4. **No recipient requirements**: Recipients don't need to do anything special

---

## Event Structure

### Ghost Note Event (Kind 30079)

```json
{
  "kind": 30079,
  "tags": [
    ["d", "ghost_<timestamp>_<random-8-hex>"],
    ["p", "<recipient-pubkey>"],
    ["expiration", "<unix-timestamp>"],
    ["client", "ghostr"],
    ["t", "ghost-note"]
  ],
  "content": "<nip44-encrypted-secret>",
  "created_at": <unix-timestamp>,
  "pubkey": "<sender-pubkey-or-delegatee>"
}
```

**Tag Breakdown:**
- `d`: Unique identifier for this Ghost Note
- `p`: Recipient's public key
- `expiration`: Unix timestamp when note should be deleted (NIP-40)
- `client`: Identifies Ghostr as the creator
- `t`: Topic tag for filtering

### Read Receipt Event (Kind 4 - Encrypted DM)

```json
{
  "kind": 4,
  "tags": [
    ["p", "<sender-pubkey>"],
    ["e", "<ghost-note-event-id>"],
    ["ghost-note-read"]
  ],
  "content": "<nip04-encrypted: 'Ghost Note read at <timestamp>'>",
  "created_at": <unix-timestamp>,
  "pubkey": "<recipient-pubkey>"
}
```

**Purpose:** Optional notification from recipient to sender indicating the note has been read.

### Deletion Event (Kind 5)

```json
{
  "kind": 5,
  "tags": [
    ["e", "<ghost-note-event-id>"]
  ],
  "content": "Ghost Note revoked by sender",
  "created_at": <unix-timestamp>,
  "pubkey": "<sender-pubkey-or-delegatee>"
}
```

**Purpose:** Sender publishes this to revoke/delete the Ghost Note before expiration.

---

## Database Schema

```sql
-- New table for Ghost Notes
CREATE TABLE ghost_notes (
  id TEXT PRIMARY KEY,           -- UUID
  event_id TEXT UNIQUE,          -- Nostr event ID
  d_tag TEXT UNIQUE NOT NULL,    -- d-tag value
  direction TEXT NOT NULL,       -- 'sent' | 'received'
  counterparty_pubkey TEXT NOT NULL,
  encrypted_content TEXT,        -- Encrypted with NIP-44
  decrypted_content TEXT,        -- Only populated after read (for received)
  created_at INTEGER NOT NULL,
  expiration INTEGER NOT NULL,
  status TEXT NOT NULL,          -- 'active' | 'read' | 'revoked' | 'expired'
  read_at INTEGER,               -- Timestamp when read
  revoked_at INTEGER,            -- Timestamp when revoked
  relay_urls TEXT,               -- JSON array of relay URLs
  notification_enabled BOOLEAN DEFAULT 1,  -- For sent notes
  metadata TEXT                  -- JSON for future extensions
);

CREATE INDEX idx_ghost_notes_direction ON ghost_notes(direction);
CREATE INDEX idx_ghost_notes_status ON ghost_notes(status);
CREATE INDEX idx_ghost_notes_counterparty ON ghost_notes(counterparty_pubkey);
CREATE INDEX idx_ghost_notes_expiration ON ghost_notes(expiration);
CREATE INDEX idx_ghost_notes_event_id ON ghost_notes(event_id);
```

**Status Values:**
- `active`: Note is live and accessible
- `read`: Note has been read by recipient
- `revoked`: Sender manually deleted the note
- `expired`: Past expiration timestamp

---

## Feature Components

### 1. Compose Interface

**Location:** New tab in main navigation or context menu on profiles

**UI Layout:**
```
┌─────────────────────────────────────────────┐
│ 👻 New Ghost Note                           │
├─────────────────────────────────────────────┤
│                                             │
│ To: [npub input or contact picker]    📖   │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │ Type your secret message...             │ │
│ │                                         │ │
│ │                                         │ │
│ │                                         │ │
│ │                                    0/500│ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Auto-delete after:                          │
│   ○ 1 hour                                  │
│   ● 6 hours   (recommended)                 │
│   ○ 24 hours                                │
│   ○ 7 days                                  │
│   ○ 30 days                                 │
│                                             │
│ ☑ Notify me when read                      │
│                                             │
│ ℹ️ You can manually revoke access anytime   │
│                                             │
│         [Cancel]  [Send Ghost Note 👻]      │
└─────────────────────────────────────────────┘
```

**Validation:**
- Recipient npub must be valid Nostr public key
- Content length: 1-500 characters
- Expiration must be in future
- At least one relay must be configured

**Expiration Options:**
- 1 hour: 3600 seconds
- 6 hours: 21600 seconds (default)
- 24 hours: 86400 seconds
- 7 days: 604800 seconds
- 30 days: 2592000 seconds

### 2. Sending Flow

**Function Signature:**
```javascript
async function createGhostNote(
  recipientPubkey: string,
  content: string,
  expirationHours: number,
  notifyOnRead: boolean
): Promise<GhostNoteResult>
```

**Implementation Steps:**

1. **Generate unique d-tag:**
   ```javascript
   const dTag = `ghost_${Date.now()}_${randomHex(8)}`;
   ```

2. **Encrypt content with NIP-44:**
   ```javascript
   const encryptedContent = await encryptGhostNote(
     content,
     recipientPubkey,
     senderPrivkey
   );
   ```

3. **Build event:**
   ```javascript
   const expirationTimestamp = Math.floor(Date.now() / 1000) + (expirationHours * 3600);
   
   const event = {
     kind: 30079,
     created_at: Math.floor(Date.now() / 1000),
     tags: [
       ["d", dTag],
       ["p", recipientPubkey],
       ["expiration", expirationTimestamp.toString()],
       ["client", "ghostr"],
       ["t", "ghost-note"]
     ],
     content: encryptedContent
   };
   ```

4. **Sign with Ghostr delegation (if available) or user's key**

5. **Publish to all configured relays**

6. **Store in local database:**
   ```javascript
   await db.ghostNotes.add({
     id: generateUUID(),
     event_id: event.id,
     d_tag: dTag,
     direction: 'sent',
     counterparty_pubkey: recipientPubkey,
     encrypted_content: encryptedContent,
     created_at: event.created_at,
     expiration: expirationTimestamp,
     status: 'active',
     relay_urls: JSON.stringify(relayUrls),
     notification_enabled: notifyOnRead
   });
   ```

7. **Generate shareable link:**
   ```javascript
   const link = `https://ghostr.org/note/${dTag}`;
   ```

8. **Show success confirmation**

**Success UI:**
```
┌─────────────────────────────────────────────┐
│ ✅ Ghost Note Sent                          │
├─────────────────────────────────────────────┤
│                                             │
│ Your Ghost Note was sent to @bob            │
│                                             │
│ 🔗 https://ghostr.org/note/ghost_17...     │
│    [Copy Link]  [Share]  [QR Code]         │
│                                             │
│ Self-destructs: Jan 15, 2026 at 2:30 PM    │
│                                             │
│ ☑ You'll be notified when read             │
│                                             │
│ [View Sent Notes]  [Send Another]  [Done]  │
└─────────────────────────────────────────────┘
```

### 3. Inbox - Received Ghost Notes

**Location:** New "Ghost Notes" section in main navigation

**UI Layout:**
```
┌─────────────────────────────────────────────┐
│ 👻 Ghost Notes Received              [📖]  │
├─────────────────────────────────────────────┤
│                                             │
│ 🔒 Unread (2)                               │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ From: @alice                            │ │
│ │ Received: 2 hours ago                   │ │
│ │ Expires: Jan 15 at 8:30 PM             │ │
│ │                                         │ │
│ │           [Read Secret 👁️]              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ From: @charlie                          │ │
│ │ Received: 1 day ago                     │ │
│ │ Expires: Jan 20 at 3:15 PM             │ │
│ │                                         │ │
│ │           [Read Secret 👁️]              │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 📭 Read (3)                                 │
│ [Show read notes...]                        │
│                                             │
│ 🪦 Expired/Revoked (1)                      │
│ [Show expired notes...]                     │
└─────────────────────────────────────────────┘
```

**Auto-discovery:**
- Subscribe to kind 30079 events with user's pubkey in p-tag
- Check on app start and periodically (every 5 minutes)
- Show notification badge for new Ghost Notes
- Push notification if enabled (mobile)

**Subscription Filter:**
```javascript
const filter = {
  kinds: [30079],
  "#p": [currentUserPubkey],
  "#t": ["ghost-note"],
  since: lastCheckTimestamp
};
```

### 4. Reading Flow

**Read Confirmation UI:**
```
┌─────────────────────────────────────────────┐
│ 👻 Ghost Note from @alice                   │
├─────────────────────────────────────────────┤
│                                             │
│ ⚠️ Ready to view this secret?               │
│                                             │
│ • This message will be marked as read       │
│ • @alice will be notified (optional)        │
│ • You can save a copy if needed            │
│ • Expires: Jan 15 at 8:30 PM               │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │        [Encrypted Preview]              │ │
│ │    Click below to decrypt...            │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ☑ Notify sender when I read this           │
│                                             │
│         [Cancel]  [Read Now 🔓]             │
└─────────────────────────────────────────────┘
```

**After Decryption:**
```
┌─────────────────────────────────────────────┐
│ 👻 Ghost Note from @alice                   │
├─────────────────────────────────────────────┤
│                                             │
│ 🔓 Secret Message:                          │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │ Here's the WiFi password for the        │ │
│ │ conference room: Tr0ub4dor&3            │ │
│ │                                         │ │
│ │ It expires tonight at midnight.         │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Read: Just now                              │
│ Expires: Jan 15 at 8:30 PM (5 hours)       │
│                                             │
│ [📋 Copy Text]  [💾 Save Copy]  [Close]    │
└─────────────────────────────────────────────┘
```

**Function Signature:**
```javascript
async function readGhostNote(
  eventId: string,
  sendNotification: boolean
): Promise<ReadResult>
```

**Implementation Steps:**

1. **Fetch event from relays:**
   ```javascript
   const event = await fetchGhostNoteByEventId(eventId);
   ```

2. **Verify p-tag matches current user:**
   ```javascript
   const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1];
   if (recipientPubkey !== getCurrentUserPubkey()) {
     throw new Error('Not authorized');
   }
   ```

3. **Check expiration hasn't passed:**
   ```javascript
   const expiration = parseInt(event.tags.find(t => t[0] === 'expiration')?.[1]);
   if (expiration < Math.floor(Date.now() / 1000)) {
     throw new Error('Ghost Note has expired');
   }
   ```

4. **Decrypt content:**
   ```javascript
   const plaintext = await decryptGhostNote(
     event.content,
     event.pubkey,
     currentUserPrivkey
   );
   ```

5. **Display plaintext to user**

6. **Update local database:**
   ```javascript
   await db.ghostNotes.update(noteId, {
     status: 'read',
     read_at: Math.floor(Date.now() / 1000),
     decrypted_content: plaintext
   });
   ```

7. **Send read receipt if requested:**
   ```javascript
   if (sendNotification) {
     await sendReadReceipt(event.id, event.pubkey);
   }
   ```

**Read Receipt Function:**
```javascript
async function sendReadReceipt(ghostNoteEventId, senderPubkey) {
  const message = `Ghost Note read at ${new Date().toISOString()}`;
  
  const dmEvent = {
    kind: 4,
    tags: [
      ["p", senderPubkey],
      ["e", ghostNoteEventId],
      ["ghost-note-read"]
    ],
    content: await encryptNIP04(message, senderPubkey),
    created_at: Math.floor(Date.now() / 1000)
  };
  
  await signAndPublish(dmEvent);
}
```

### 5. Sent Notes Management

**Location:** "Sent Ghost Notes" tab or section

**UI Layout:**
```
┌─────────────────────────────────────────────┐
│ 👻 Sent Ghost Notes                  [+ New]│
├─────────────────────────────────────────────┤
│                                             │
│ 📤 Active (2)                               │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ To: @bob                                │ │
│ │ Status: 🟢 Unread                       │ │
│ │ Sent: 30 minutes ago                    │ │
│ │ Expires: Jan 15 at 8:00 PM (5.5 hrs)   │ │
│ │                                         │ │
│ │ [📋 Copy Link]  [🗑️ Revoke Now]        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ To: @charlie                            │ │
│ │ Status: 🟡 Read 2 hours ago             │ │
│ │ Sent: 5 hours ago                       │ │
│ │ Expires: Jan 16 at 2:00 PM (1.3 days)  │ │
│ │                                         │ │
│ │ [📋 Copy Link]  [🗑️ Revoke Now]        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ 🗑️ Revoked (3)                              │
│ [Show revoked notes...]                     │
│                                             │
│ 🪦 Expired (5)                              │
│ [Show expired notes...]                     │
└─────────────────────────────────────────────┘
```

**Status Indicators:**
- 🟢 **Unread**: Active, not yet accessed
- 🟡 **Read**: Recipient has read it
- 🗑️ **Revoked**: Manually deleted by sender
- 🪦 **Expired**: Past expiration timestamp

**Query for Active Sent Notes:**
```javascript
const activeSentNotes = await db.ghostNotes
  .where('direction').equals('sent')
  .and(note => note.status === 'active')
  .sortBy('created_at');
```

### 6. Revocation Flow

**Confirmation Dialog:**
```
┌─────────────────────────────────────────────┐
│ ⚠️ Revoke Ghost Note?                       │
├─────────────────────────────────────────────┤
│                                             │
│ You're about to revoke the Ghost Note       │
│ sent to @bob.                               │
│                                             │
│ This will:                                  │
│ • Delete the note from relays              │
│ • Prevent @bob from reading it             │
│ • Cannot be undone                         │
│                                             │
│ Note status: 🟢 Unread (not yet accessed)  │
│                                             │
│         [Cancel]  [Revoke Now 🗑️]          │
└─────────────────────────────────────────────┘
```

**Function Signature:**
```javascript
async function revokeGhostNote(eventId: string): Promise<RevocationResult>
```

**Implementation Steps:**

1. **Fetch Ghost Note from local database:**
   ```javascript
   const note = await db.ghostNotes.where('event_id').equals(eventId).first();
   ```

2. **Confirm user action** (show dialog)

3. **Create kind 5 deletion event:**
   ```javascript
   const deletionEvent = {
     kind: 5,
     tags: [["e", eventId]],
     content: "Ghost Note revoked by sender",
     created_at: Math.floor(Date.now() / 1000)
   };
   ```

4. **Sign with same key used for original event**

5. **Publish deletion to ALL relays:**
   ```javascript
   const relayUrls = JSON.parse(note.relay_urls);
   const results = await publishToRelays(deletionEvent, relayUrls);
   ```

6. **Update local database:**
   ```javascript
   await db.ghostNotes.update(note.id, {
     status: 'revoked',
     revoked_at: Math.floor(Date.now() / 1000)
   });
   ```

7. **Show success confirmation**

8. **Retry failed deletions** (background process, up to 3 attempts)

**Success UI:**
```
┌─────────────────────────────────────────────┐
│ ✅ Ghost Note Revoked                       │
├─────────────────────────────────────────────┤
│                                             │
│ The Ghost Note to @bob has been deleted.    │
│                                             │
│ Deletion published to 5 relays:             │
│ ✓ wss://relay.damus.io                     │
│ ✓ wss://nos.lol                            │
│ ✓ wss://relay.nostr.band                   │
│ ✓ wss://nostr.wine                         │
│ ⚠️ wss://backup-relay.net (retrying...)    │
│                                             │
│ [Close]                                     │
└─────────────────────────────────────────────┘
```

### 7. Read Receipt Handling

**Notification Types:**

**In-app notification:**
```
┌─────────────────────────────────────────────┐
│ 🔔 Notifications                            │
├─────────────────────────────────────────────┤
│                                             │
│ 👻 @bob read your Ghost Note                │
│    Read: 5 minutes ago                      │
│    [View Details]                           │
│                                             │
└─────────────────────────────────────────────┘
```

**Push notification** (if enabled):
```
Ghostr
👻 Ghost Note Read
@bob read your Ghost Note sent 2 hours ago
```

**Function Signature:**
```javascript
async function handleReadReceipt(dmEvent: NostrEvent): Promise<void>
```

**Implementation Steps:**

1. **Listen for kind 4 DMs with ["ghost-note-read"] tag:**
   ```javascript
   const filter = {
     kinds: [4],
     "#p": [currentUserPubkey],
     "#ghost-note-read": []
   };
   ```

2. **Extract ghost note event ID from e-tag:**
   ```javascript
   const ghostNoteEventId = dmEvent.tags.find(t => t[0] === 'e')?.[1];
   ```

3. **Decrypt DM content to get timestamp:**
   ```javascript
   const decryptedMessage = await decryptNIP04(
     dmEvent.content,
     dmEvent.pubkey,
     currentUserPrivkey
   );
   ```

4. **Find matching ghost note in database:**
   ```javascript
   const note = await db.ghostNotes
     .where('event_id').equals(ghostNoteEventId)
     .first();
   ```

5. **Update status:**
   ```javascript
   await db.ghostNotes.update(note.id, {
     status: 'read',
     read_at: Math.floor(Date.now() / 1000)
   });
   ```

6. **Show notification to sender**

7. **Update UI if Sent Notes view is open**

### 8. URL Handling

**URL Format:** `https://ghostr.org/note/<d-tag>`

**Example:** `https://ghostr.org/note/ghost_1705334400_a1b2c3d4`

**Deep Link Handler:**
```javascript
async function handleGhostNoteURL(url: string): Promise<void> {
  // Extract d-tag from URL
  const dTag = extractDTagFromURL(url);
  
  // Check if already in database
  const existing = await db.ghostNotes.where('d_tag').equals(dTag).first();
  
  if (existing) {
    // Navigate to existing note
    navigateToGhostNote(existing.id);
    return;
  }
  
  // Fetch from relays
  const event = await fetchGhostNoteByDTag(dTag);
  
  if (!event) {
    showError('Ghost Note not found - it may have been revoked or expired');
    return;
  }
  
  // Verify we're the recipient
  const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1];
  
  if (recipientPubkey !== getCurrentUserPubkey()) {
    showError('This Ghost Note is not addressed to you');
    return;
  }
  
  // Save to database
  await saveReceivedGhostNote(event);
  
  // Navigate to read view
  navigateToGhostNote(event.id);
}

function extractDTagFromURL(url: string): string {
  // Extract from https://ghostr.org/note/<d-tag>
  const match = url.match(/\/note\/([^/?#]+)/);
  return match ? match[1] : '';
}
```

### 9. Expiration Cleanup

**Background Job:** Runs every hour when app is open

**Function Signature:**
```javascript
async function cleanupExpiredGhostNotes(): Promise<CleanupResult>
```

**Implementation Steps:**

1. **Query all ghost notes with status='active':**
   ```javascript
   const activeNotes = await db.ghostNotes
     .where('status').equals('active')
     .toArray();
   ```

2. **Check if expiration < current time:**
   ```javascript
   const now = Math.floor(Date.now() / 1000);
   const expiredNotes = activeNotes.filter(note => note.expiration < now);
   ```

3. **For sent notes: publish deletion events (cleanup):**
   ```javascript
   for (const note of expiredNotes) {
     if (note.direction === 'sent') {
       try {
         await revokeGhostNote(note.event_id);
       } catch (error) {
         console.error('Failed to cleanup expired note:', error);
       }
     }
   }
   ```

4. **Update status to 'expired':**
   ```javascript
   await Promise.all(
     expiredNotes.map(note =>
       db.ghostNotes.update(note.id, { status: 'expired' })
     )
   );
   ```

5. **Optional: clear decrypted_content from database:**
   ```javascript
   await Promise.all(
     expiredNotes.map(note =>
       db.ghostNotes.update(note.id, { decrypted_content: null })
     )
   );
   ```

**Scheduling:**
```javascript
// Run on app start
await cleanupExpiredGhostNotes();

// Run every hour
setInterval(async () => {
  await cleanupExpiredGhostNotes();
}, 3600000);
```

### 10. Settings

**Ghost Note Settings Panel:**
```
┌─────────────────────────────────────────────┐
│ ⚙️ Ghost Note Settings                      │
├─────────────────────────────────────────────┤
│                                             │
│ Default Expiration:                         │
│   [6 hours ▼]                               │
│                                             │
│ Notifications:                              │
│   ☑ Notify me when Ghost Notes are read    │
│   ☑ Show badge for new Ghost Notes         │
│   ☑ Push notifications (mobile)            │
│                                             │
│ Privacy:                                    │
│   ☐ Keep decrypted content in database     │
│   ☑ Send read receipts by default          │
│                                             │
│ Advanced:                                   │
│   ☑ Auto-cleanup expired notes (hourly)    │
│   ☑ Retry failed deletion attempts         │
│                                             │
└─────────────────────────────────────────────┘
```

**Settings Schema:**
```javascript
const ghostNoteSettings = {
  defaultExpiration: 21600,              // 6 hours in seconds
  notifyOnRead: true,
  showBadge: true,
  pushNotifications: true,
  keepDecryptedContent: false,
  sendReadReceiptsByDefault: true,
  autoCleanupExpired: true,
  retryFailedDeletions: true
};
```

---

## Implementation Checklist

### Phase 1: Core Functionality
- [ ] Create database schema for ghost_notes table
- [ ] Implement NIP-44 encryption/decryption functions
- [ ] Build Ghost Note compose UI component
- [ ] Implement `createGhostNote()` function
- [ ] Build sent notes list UI component
- [ ] Implement `revokeGhostNote()` function
- [ ] Build received notes inbox UI component
- [ ] Implement `readGhostNote()` function
- [ ] Handle Ghost Note URLs and deep links
- [ ] Implement `handleGhostNoteURL()` function

### Phase 2: Notifications
- [ ] Implement `sendReadReceipt()` function
- [ ] Build read receipt listener/handler
- [ ] Create in-app notification UI
- [ ] Integrate push notifications (mobile)
- [ ] Update sent notes status in real-time
- [ ] Implement `handleReadReceipt()` function

### Phase 3: Polish
- [ ] Implement expiration cleanup job
- [ ] Add QR code generation for links
- [ ] Build settings panel UI
- [ ] Add copy/share functionality
- [ ] Create help documentation
- [ ] Add animations and transitions
- [ ] Implement error handling for all edge cases
- [ ] Add retry logic for failed relay operations

### Phase 4: Testing
- [ ] Test encryption/decryption round-trip
- [ ] Test revocation on multiple relays
- [ ] Test expiration edge cases
- [ ] Test read receipts end-to-end
- [ ] Test URL handling and deep links
- [ ] Test with offline scenarios
- [ ] Test with malformed events
- [ ] Load testing with many Ghost Notes
- [ ] Test cross-device synchronization
- [ ] Test delegation signing

---

## Key Functions Reference

### Encryption Functions

```javascript
/**
 * Encrypt plaintext for Ghost Note using NIP-44
 * @param plaintext - The secret message to encrypt
 * @param recipientPubkey - Recipient's public key (hex)
 * @param senderPrivkey - Sender's private key (hex)
 * @returns Base64 encoded encrypted content
 */
async function encryptGhostNote(
  plaintext: string,
  recipientPubkey: string,
  senderPrivkey: string
): Promise<string> {
  const sharedSecret = nip44.getConversationKey(senderPrivkey, recipientPubkey);
  return nip44.encrypt(plaintext, sharedSecret);
}

/**
 * Decrypt Ghost Note content using NIP-44
 * @param ciphertext - Base64 encoded encrypted content
 * @param senderPubkey - Sender's public key (hex)
 * @param recipientPrivkey - Recipient's private key (hex)
 * @returns Decrypted plaintext
 */
async function decryptGhostNote(
  ciphertext: string,
  senderPubkey: string,
  recipientPrivkey: string
): Promise<string> {
  const sharedSecret = nip44.getConversationKey(recipientPrivkey, senderPubkey);
  return nip44.decrypt(ciphertext, sharedSecret);
}
```

### Event Creation

```javascript
/**
 * Build a Ghost Note event
 * @param recipientPubkey - Recipient's public key (hex)
 * @param encryptedContent - Encrypted content from encryptGhostNote()
 * @param expirationSeconds - Seconds until expiration
 * @returns Unsigned Nostr event (kind 30079)
 */
function buildGhostNoteEvent(
  recipientPubkey: string,
  encryptedContent: string,
  expirationSeconds: number
): UnsignedEvent {
  const now = Math.floor(Date.now() / 1000);
  const dTag = `ghost_${now}_${randomHex(8)}`;
  
  return {
    kind: 30079,
    created_at: now,
    tags: [
      ["d", dTag],
      ["p", recipientPubkey],
      ["expiration", (now + expirationSeconds).toString()],
      ["client", "ghostr"],
      ["t", "ghost-note"]
    ],
    content: encryptedContent
  };
}

/**
 * Generate random hex string for d-tag
 * @param length - Number of hex characters
 * @returns Random hex string
 */
function randomHex(length: number): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### Relay Operations

```javascript
/**
 * Publish event to multiple relays
 * @param event - Signed Nostr event
 * @param relayUrls - Array of relay WebSocket URLs
 * @returns Object with successful and failed relay URLs
 */
async function publishToRelays(
  event: SignedEvent,
  relayUrls: string[]
): Promise<PublishResults> {
  const results = { successful: [], failed: [] };
  
  for (const url of relayUrls) {
    try {
      const relay = await Relay.connect(url);
      await relay.publish(event);
      results.successful.push(url);
      relay.close();
    } catch (error) {
      results.failed.push({ url, error: error.message });
    }
  }
  
  return results;
}

/**
 * Fetch Ghost Note by d-tag from relays
 * @param dTag - The d-tag identifier
 * @param relayUrls - Array of relay URLs to query
 * @returns Nostr event or null if not found
 */
async function fetchGhostNoteByDTag(
  dTag: string,
  relayUrls: string[]
): Promise<NostrEvent | null> {
  const filters = [{
    kinds: [30079],
    "#d": [dTag],
    "#t": ["ghost-note"]
  }];
  
  // Try relays in parallel
  const events = await pool.querySync(relayUrls, filters);
  
  return events[0] || null;
}

/**
 * Fetch Ghost Note by event ID from relays
 * @param eventId - The Nostr event ID (hex)
 * @param relayUrls - Array of relay URLs to query
 * @returns Nostr event or null if not found
 */
async function fetchGhostNoteByEventId(
  eventId: string,
  relayUrls: string[]
): Promise<NostrEvent | null> {
  const filters = [{
    kinds: [30079],
    ids: [eventId]
  }];
  
  const events = await pool.querySync(relayUrls, filters);
  
  return events[0] || null;
}
```

### Database Operations

```javascript
/**
 * Save received Ghost Note to database
 * @param event - The Ghost Note Nostr event
 * @returns Database record ID
 */
async function saveReceivedGhostNote(event: NostrEvent): Promise<string> {
  const dTag = event.tags.find(t => t[0] === 'd')?.[1];
  const recipientPubkey = event.tags.find(t => t[0] === 'p')?.[1];
  const expiration = parseInt(event.tags.find(t => t[0] === 'expiration')?.[1]);
  
  const id = generateUUID();
  
  await db.ghostNotes.add({
    id,
    event_id: event.id,
    d_tag: dTag,
    direction: 'received',
    counterparty_pubkey: event.pubkey,
    encrypted_content: event.content,
    decrypted_content: null,
    created_at: event.created_at,
    expiration,
    status: 'active',
    relay_urls: null,
    notification_enabled: false,
    metadata: null
  });
  
  return id;
}

/**
 * Get all Ghost Notes for current user
 * @param direction - Filter by 'sent' or 'received'
 * @param status - Filter by status (optional)
 * @returns Array of Ghost Note records
 */
async function getGhostNotes(
  direction: 'sent' | 'received',
  status?: string
): Promise<GhostNote[]> {
  let query = db.ghostNotes.where('direction').equals(direction);
  
  if (status) {
    query = query.and(note => note.status === status);
  }
  
  return await query.reverse().sortBy('created_at');
}
```

### Utility Functions

```javascript
/**
 * Format expiration timestamp for display
 * @param expirationTimestamp - Unix timestamp
 * @returns Human-readable string
 */
function formatExpiration(expirationTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = expirationTimestamp - now;
  
  if (remaining < 0) {
    return 'Expired';
  }
  
  if (remaining < 3600) {
    const minutes = Math.floor(remaining / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  
  if (remaining < 86400) {
    const hours = Math.floor(remaining / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  const days = Math.floor(remaining / 86400);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

/**
 * Generate shareable Ghost Note URL
 * @param dTag - The d-tag identifier
 * @returns Full URL
 */
function generateGhostNoteURL(dTag: string): string {
  return `https://ghostr.org/note/${dTag}`;
}

/**
 * Generate UUID v4
 * @returns UUID string
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
```

---

## Error Handling

### Common Errors

| Error | Cause | User Message | Action |
|-------|-------|--------------|--------|
| **Invalid Recipient** | Malformed npub/pubkey | "Invalid recipient npub. Please check and try again." | Allow correction |
| **Encryption Failed** | NIP-44 error | "Failed to encrypt message. Please try again." | Retry with same data |
| **Publish Failed** | All relays failed | "Could not send Ghost Note. Check your relay connections." | Show relay status |
| **Not Found** | Event doesn't exist | "Ghost Note not found. It may have been revoked or expired." | Return to inbox |
| **Wrong Recipient** | p-tag doesn't match | "This Ghost Note is not addressed to you." | Return to inbox |
| **Expired** | Past expiration | "This Ghost Note has expired and is no longer available." | Mark as expired |
| **Decryption Failed** | Corrupted or wrong key | "Could not decrypt message. The content may be corrupted." | Show error state |
| **Revoke Failed** | Deletion event failed | "Failed to revoke Ghost Note. Please try again." | Retry revocation |

### Error Messages Object

```javascript
const ERROR_MESSAGES = {
  INVALID_RECIPIENT: "Invalid recipient npub. Please check and try again.",
  ENCRYPTION_FAILED: "Failed to encrypt message. Please try again.",
  PUBLISH_FAILED: "Could not send Ghost Note. Check your relay connections.",
  NOT_FOUND: "Ghost Note not found. It may have been revoked or expired.",
  WRONG_RECIPIENT: "This Ghost Note is not addressed to you.",
  EXPIRED: "This Ghost Note has expired and is no longer available.",
  DECRYPTION_FAILED: "Could not decrypt message. The content may be corrupted.",
  REVOKE_FAILED: "Failed to revoke Ghost Note. Please try again.",
  NO_RELAYS: "No relays configured. Please add relays in settings.",
  NETWORK_ERROR: "Network error. Please check your connection.",
  UNKNOWN_ERROR: "An unexpected error occurred. Please try again."
};
```

### Error Handling Pattern

```javascript
async function performGhostNoteOperation() {
  try {
    // Attempt operation
    await someOperation();
  } catch (error) {
    console.error('Ghost Note operation failed:', error);
    
    // Map to user-friendly message
    const userMessage = mapErrorToMessage(error);
    
    // Show to user
    showErrorToast(userMessage);
    
    // Log for debugging
    logError('ghost-note-operation', error);
    
    // Optional: Attempt recovery
    if (isRecoverable(error)) {
      await attemptRecovery();
    }
  }
}

function mapErrorToMessage(error: Error): string {
  if (error.message.includes('invalid pubkey')) {
    return ERROR_MESSAGES.INVALID_RECIPIENT;
  }
  if (error.message.includes('encryption')) {
    return ERROR_MESSAGES.ENCRYPTION_FAILED;
  }
  if (error.message.includes('not found')) {
    return ERROR_MESSAGES.NOT_FOUND;
  }
  // ... more mappings
  
  return ERROR_MESSAGES.UNKNOWN_ERROR;
}
```

---

## Security Considerations

### 1. Encryption
- **Use NIP-44** for all Ghost Note content encryption
- NIP-44 provides authenticated encryption with forward secrecy
- Never fall back to NIP-04 (deprecated and less secure)

### 2. Key Handling
- **Never log private keys** or decrypted content
- Clear sensitive data from memory when no longer needed
- Use secure key derivation for shared secrets
- Validate all public keys before use

### 3. Memory Clearing
```javascript
// Clear decrypted content after display
function clearDecryptedContent(noteId: string) {
  // Clear from UI
  document.querySelector(`#note-${noteId}`).textContent = '';
  
  // Clear from database (if setting enabled)
  if (!settings.keepDecryptedContent) {
    db.ghostNotes.update(noteId, { decrypted_content: null });
  }
}
```

### 4. Relay Trust
- Don't trust relays for deletion - they're best-effort
- Always include expiration timestamp as fallback
- Publish deletions to all relays that received original
- Retry failed deletions multiple times

### 5. Expiration
- **Always set expiration** - never create Ghost Notes without it
- Use reasonable defaults (6 hours recommended)
- Warn users if setting very long expirations (>30 days)
- Run cleanup job regularly to delete expired notes

### 6. Read Receipts
- Make read receipts **optional and user-controlled**
- Encrypt read receipts with NIP-04 (standard DMs)
- Don't reveal reading behavior without consent

### 7. URL Sharing
- URLs contain only event identifiers, never keys
- d-tags are public but don't reveal content
- Anyone with URL can verify note exists, not read content
- Consider using relay hints in URL fragments for better fetching

### 8. Input Validation
```javascript
function validateGhostNoteInput(recipientPubkey: string, content: string): void {
  // Validate recipient pubkey
  if (!isValidPubkey(recipientPubkey)) {
    throw new Error('Invalid recipient public key');
  }
  
  // Validate content length
  if (content.length < 1 || content.length > 500) {
    throw new Error('Content must be 1-500 characters');
  }
  
  // Sanitize content (if displaying as HTML)
  const sanitized = sanitizeHTML(content);
  
  return sanitized;
}

function isValidPubkey(pubkey: string): boolean {
  // Check hex format (64 characters)
  if (/^[0-9a-f]{64}$/i.test(pubkey)) {
    return true;
  }
  
  // Check npub format
  if (pubkey.startsWith('npub1')) {
    try {
      nip19.decode(pubkey);
      return true;
    } catch {
      return false;
    }
  }
  
  return false;
}
```

### 9. Rate Limiting
- Implement client-side rate limits for Ghost Note creation
- Prevent spam by limiting sends per hour
- Suggested limits:
  - 10 Ghost Notes per hour for regular users
  - 50 Ghost Notes per hour for power users

```javascript
const RATE_LIMITS = {
  GHOST_NOTES_PER_HOUR: 10,
  REVOCATIONS_PER_HOUR: 20
};

async function checkRateLimit(action: string): Promise<boolean> {
  const key = `rate_limit_${action}`;
  const now = Date.now();
  const hourAgo = now - 3600000;
  
  // Get recent actions
  const recentActions = await db.rateLimits
    .where('action').equals(action)
    .and(record => record.timestamp > hourAgo)
    .count();
  
  const limit = RATE_LIMITS[action.toUpperCase()] || 10;
  
  return recentActions < limit;
}
```

---

## User Education

### First-Time Flow

Show tutorial on first Ghost Note send:

**Step 1: Introduction**
```
┌─────────────────────────────────────────────┐
│ 👻 Welcome to Ghost Notes                   │
├─────────────────────────────────────────────┤
│                                             │
│ Ghost Notes are encrypted secrets that      │
│ self-destruct after a set time.             │
│                                             │
│ [Next →]                                    │
└─────────────────────────────────────────────┘
```

**Step 2: Encryption**
```
┌─────────────────────────────────────────────┐
│ 🔐 End-to-End Encrypted                     │
├─────────────────────────────────────────────┤
│                                             │
│ Only you and the recipient can read         │
│ Ghost Notes. Even relays can't see the      │
│ content.                                    │
│                                             │
│ [← Back]  [Next →]                          │
└─────────────────────────────────────────────┘
```

**Step 3: Control**
```
┌─────────────────────────────────────────────┐
│ 🗑️ You're in Control                        │
├─────────────────────────────────────────────┤
│                                             │
│ You can revoke access to your Ghost Note    │
│ anytime before it expires.                  │
│                                             │
│ [← Back]  [Next →]                          │
└─────────────────────────────────────────────┘
```

**Step 4: Notifications**
```
┌─────────────────────────────────────────────┐
│ 🔔 Optional Notifications                   │
├─────────────────────────────────────────────┤
│                                             │
│ Get notified when your Ghost Note is read   │
│ (recipient can choose to send or not).      │
│                                             │
│ [← Back]  [Get Started 👻]                  │
└─────────────────────────────────────────────┘
```

### Help Documentation

**What are Ghost Notes?**
```markdown
Ghost Notes are encrypted, self-destructing messages you can send 
to anyone on Nostr. They're perfect for sharing temporary secrets 
like passwords, meeting links, or sensitive information.

Key features:
• End-to-end encrypted with NIP-44
• Automatic expiration (you choose the time)
• Revoke access anytime
• Optional read notifications
```

**How Does Encryption Work?**
```markdown
Ghost Notes use NIP-44 encryption, the same strong encryption used 
for private messages on Nostr. 

When you send a Ghost Note:
1. Your message is encrypted with the recipient's public key
2. Only the recipient's private key can decrypt it
3. Not even the relays storing the note can read it

This means your secrets stay secret!
```

**How to Send a Ghost Note**
```markdown
1. Click the Ghost Note button (👻)
2. Enter the recipient's npub or select from contacts
3. Type your secret message
4. Choose how long before it expires
5. Optionally enable "Notify me when read"
6. Click "Send Ghost Note"
7. Share the link with your recipient

You can revoke the note anytime from "Sent Ghost Notes".
```

**How to Read a Ghost Note**
```markdown
When someone sends you a Ghost Note:

1. You'll see it in your Ghost Notes inbox
2. Click "Read Secret" to decrypt and view
3. Optionally notify the sender you've read it
4. Save a copy if you need to keep it

Remember: Once the note expires, it's gone forever!
```

**Understanding Expiration**
```markdown
Every Ghost Note has an expiration time. After this time:

• Relays will automatically delete the note (NIP-40)
• The recipient can no longer access it
• It's permanently gone

Choose your expiration based on sensitivity:
• 1 hour - Very sensitive secrets
• 6 hours - Recommended default
• 24 hours - Less time-sensitive
• 7-30 days - Low sensitivity, more convenience

You can also manually revoke anytime before expiration!
```

**What are Read Receipts?**
```markdown
Read receipts are optional notifications that let the sender 
know when you've read their Ghost Note.

For recipients:
• You choose whether to send a read receipt
• Default setting can be changed in Settings
• Completely optional - no pressure

For senders:
• Get notified when your note is read
• Helps you know when to revoke if needed
• Can be disabled per-note

Read receipts are encrypted DMs - your privacy is protected!
```

---

## Appendix

### NIPs Referenced
- **NIP-01**: Basic protocol flow
- **NIP-04**: Legacy encryption (for read receipts only)
- **NIP-05**: Identity verification (optional for recipients)
- **NIP-09**: Event deletion
- **NIP-19**: bech32 encoding (npub)
- **NIP-26**: Delegated event signing
- **NIP-40**: Event expiration
- **NIP-44**: Encrypted payloads (versioned encryption)
- **NIP-78**: Application-specific data (parameterized replaceable)

### Recommended Relays
Relays known to support NIP-40:
- wss://relay.damus.io
- wss://nos.lol
- wss://relay.nostr.band
- wss://nostr.wine
- wss://relay.snort.social

### TypeScript Type Definitions

```typescript
interface GhostNote {
  id: string;
  event_id: string;
  d_tag: string;
  direction: 'sent' | 'received';
  counterparty_pubkey: string;
  encrypted_content: string;
  decrypted_content: string | null;
  created_at: number;
  expiration: number;
  status: 'active' | 'read' | 'revoked' | 'expired';
  read_at: number | null;
  revoked_at: number | null;
  relay_urls: string | null;
  notification_enabled: boolean;
  metadata: string | null;
}

interface UnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

interface SignedEvent extends UnsignedEvent {
  id: string;
  pubkey: string;
  sig: string;
}

interface NostrEvent extends SignedEvent {}

interface PublishResults {
  successful: string[];
  failed: Array<{ url: string; error: string }>;
}

interface GhostNoteResult {
  success: boolean;
  ghostNote?: GhostNote;
  error?: string;
  link?: string;
}

interface ReadResult {
  success: boolean;
  plaintext?: string;
  error?: string;
}

interface RevocationResult {
  success: boolean;
  deletedFromRelays: string[];
  failedRelays: string[];
  error?: string;
}

interface CleanupResult {
  expiredCount: number;
  cleanedCount: number;
  failedCount: number;
}
```

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-01-14 | Initial specification | Claude + Daniel |

---

**End of Specification**
