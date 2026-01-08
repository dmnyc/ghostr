# Bot-Based Cross-Client Compatible DM Notification System
## Implementation Plan for Ghostr

**Date:** 2026-01-08  
**Project:** Ghostr - Nostr Delegation Platform  
**Goal:** Add bot-based NIP-04 encrypted DM notifications to supplement gift-wrap messages

---

## Executive Summary

This plan implements a notification bot that sends NIP-04 encrypted DMs (kind 4) to improve cross-client compatibility. The bot will operate alongside (not replacing) the existing NIP-59 gift wrap system, providing human-readable notifications that work with Keychat, Damus, Primal, and other clients.

**Bot Identity:** `npub1gh0strl6djhzj2h7rcvzx7x902uc5esdd7gwhkv4599aqz8m4pys8ryan3`

**Key Decision:** Due to client-side architecture constraints, the bot nsec will be exposed in the bundle. This is acceptable because:
1. Bot only sends notifications (no sensitive data access)
2. Bot has no special privileges or access to user data
3. Worst case: spam from compromised bot key (easily blocked)
4. Users can disable bot notifications in settings

---

## Problem Statement

### Current Issues

**Gift-Wrap Incompatibility:**
- NIP-59 gift-wrapped messages work perfectly in Ghostr
- Other Nostr clients have poor support:
  - **Keychat:** Shows notifications but no message body
  - **Damus:** No notification at all
  - **Primal:** No notification at all

**User Impact:**
- Publishers miss new submissions
- Delegates miss approval/rejection notifications
- Poor cross-client user experience

### Solution

Send supplementary NIP-04 encrypted DMs (kind 4) via bot:
- Wide client compatibility (works everywhere)
- Human-readable messages
- Non-blocking (doesn't replace gift wrap)
- User-controllable (can be disabled)

---

## Phase 1: Infrastructure & Environment Setup

### 1.1 Environment Variable Support

**Create:** `/Users/daniel/GitHub/ghostr/.env.example`
```env
# Bot Configuration (Optional)
# This bot sends cross-client compatible DM notifications
# If not configured, the app will work normally without bot notifications
VITE_BOT_NSEC=nsec1...

# Security Note: In a client-side app, this nsec will be exposed in the bundle.
# The bot should only have permission to send notifications, nothing else.
# Recommended: Use the vanity npub: npub1gh0strl6djhzj2h7rcvzx7x902uc5esdd7gwhkv4599aqz8m4pys8ryan3
```

**Verify:** `.gitignore` already includes `.env` files ✓

### 1.2 Bot Signer Utility

**Create:** `/Users/daniel/GitHub/ghostr/src/lib/ndk/botSigner.ts`

```typescript
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk'
import { createNSECSigner } from './signers'

let botSigner: NDKPrivateKeySigner | null = null
let botEnabled = false

/**
 * Initialize the bot signer from environment variable
 * Call this once during app initialization
 */
export function initializeBotSigner(): void {
  const botNsec = import.meta.env.VITE_BOT_NSEC

  if (!botNsec) {
    console.log('[BotSigner] No bot nsec configured - bot notifications disabled')
    botEnabled = false
    botSigner = null
    return
  }

  try {
    botSigner = createNSECSigner(botNsec)
    botEnabled = true
    console.log('[BotSigner] Bot signer initialized successfully')
  } catch (error) {
    console.error('[BotSigner] Failed to initialize bot signer:', error)
    botEnabled = false
    botSigner = null
  }
}

export function getBotSigner(): NDKPrivateKeySigner | null {
  return botEnabled ? botSigner : null
}

export function isBotEnabled(): boolean {
  return botEnabled
}

export async function getBotPubkey(): Promise<string | null> {
  if (!botSigner) return null
  try {
    const user = await botSigner.user()
    return user.pubkey
  } catch {
    return null
  }
}
```

### 1.3 App Initialization

**Modify:** `/Users/daniel/GitHub/ghostr/src/main.tsx`

```typescript
import { initializeBotSigner } from '@/lib/ndk/botSigner'

// Call before React render
initializeBotSigner()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
)
```

---

## Phase 2: Core Bot Notification Module

### 2.1 NIP-04 DM Utility

**Create:** `/Users/daniel/GitHub/ghostr/src/lib/nostr/nip04.ts`

```typescript
import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk'
import { useNDKStore } from '@/stores/ndkStore'
import { getBotSigner } from '@/lib/ndk/botSigner'

/**
 * Send a NIP-04 encrypted DM (kind 4) using the bot signer
 * Returns true if sent successfully, false otherwise
 */
export async function sendBotDM(
  recipientPubkey: string,
  message: string
): Promise<boolean> {
  const botSigner = getBotSigner()
  
  if (!botSigner) {
    console.log('[BotDM] Bot not configured, skipping notification')
    return false
  }

  const { ndk } = useNDKStore.getState()
  
  if (!ndk) {
    console.error('[BotDM] NDK not initialized')
    return false
  }

  try {
    const recipient = new NDKUser({ pubkey: recipientPubkey })
    
    // Encrypt the message using NIP-04
    const encryptedContent = await botSigner.encrypt(recipient, message)
    
    // Create kind 4 event
    const dmEvent = new NDKEvent(ndk)
    dmEvent.kind = 4
    dmEvent.content = encryptedContent
    dmEvent.tags = [['p', recipientPubkey]]
    dmEvent.created_at = Math.floor(Date.now() / 1000)
    
    // Sign with bot signer
    await dmEvent.sign(botSigner)
    
    // Publish with timeout (don't block on slow relays)
    const publishPromise = dmEvent.publish()
    const timeoutPromise = new Promise<void>((resolve) => 
      setTimeout(resolve, 3000)
    )
    await Promise.race([publishPromise, timeoutPromise])
    
    console.log('[BotDM] Notification sent to', recipientPubkey.slice(0, 8))
    return true
  } catch (error) {
    console.error('[BotDM] Failed to send notification:', error)
    return false
  }
}

/**
 * Send notification with fire-and-forget pattern
 * Does not throw errors - failures are logged only
 */
export function sendBotNotification(
  recipientPubkey: string,
  message: string
): void {
  sendBotDM(recipientPubkey, message).catch((error) => {
    console.error('[BotDM] Notification error (non-critical):', error)
  })
}
```

**⚠️ CRITICAL NOTE on NIP-04 vs NIP-44:**
- Current app uses NIP-44 encryption (per README)
- NDK's `signer.encrypt()` may default to NIP-44
- We need NIP-04 for cross-client compatibility
- **Action Required:** Test if NDK uses NIP-04 for kind 4 events
- **Fallback:** May need `nostr-tools` for explicit NIP-04 encryption

### 2.2 Message Templates

**Create:** `/Users/daniel/GitHub/ghostr/src/lib/notifications/messageTemplates.ts`

```typescript
import { fetchProfile, getDisplayName } from '@/services/profileSearchService'

export interface NotificationContext {
  delegatePubkey?: string
  delegateName?: string
  publisherPubkey?: string
  publisherName?: string
  submissionId?: string
  eventId?: string
  feedback?: string
  contentPreview?: string
}

async function getUserName(pubkey: string): Promise<string> {
  try {
    const profile = await fetchProfile(pubkey)
    if (profile) {
      return getDisplayName(profile)
    }
  } catch (error) {
    console.error('[MessageTemplates] Failed to fetch profile:', error)
  }
  return `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`
}

export async function createNewSubmissionNotification(
  context: NotificationContext
): Promise<string> {
  const delegateName = context.delegateName || 
    (context.delegatePubkey ? await getUserName(context.delegatePubkey) : 'Unknown')
  
  const contentPreview = context.contentPreview 
    ? `\n\nPreview: "${context.contentPreview.slice(0, 100)}${context.contentPreview.length > 100 ? '...' : ''}"`
    : ''
  
  return `📬 New Submission from ${delegateName}

You have received a new content submission in Ghostr.${contentPreview}

Open Ghostr to review and publish: https://ghostr.xyz

Submission ID: ${context.submissionId || 'N/A'}`
}

export async function createSubmissionReceivedNotification(
  context: NotificationContext
): Promise<string> {
  const publisherName = context.publisherName || 
    (context.publisherPubkey ? await getUserName(context.publisherPubkey) : 'the publisher')
  
  return `✅ Submission Received

Your content has been sent to ${publisherName} for review.

We'll notify you when it's been reviewed. Track status in Ghostr: https://ghostr.xyz

Submission ID: ${context.submissionId || 'N/A'}`
}

export async function createApprovalNotification(
  context: NotificationContext
): Promise<string> {
  const eventLink = context.eventId 
    ? `\n\nView on nostr: nostr:${context.eventId}`
    : ''
  
  return `🎉 Content Published!

Great news! Your submission has been approved and published to Nostr.${eventLink}

View your published content in Ghostr: https://ghostr.xyz

Submission ID: ${context.submissionId || 'N/A'}`
}

export async function createRejectionNotification(
  context: NotificationContext
): Promise<string> {
  const feedbackSection = context.feedback 
    ? `\n\nFeedback from publisher:\n"${context.feedback}"\n\nYou can revise and resubmit in Ghostr.`
    : '\n\nYou can revise and resubmit your content in Ghostr.'
  
  return `📝 Submission Update

Your submission has been reviewed and requires revisions.${feedbackSection}

Open Ghostr to edit and resubmit: https://ghostr.xyz

Submission ID: ${context.submissionId || 'N/A'}`
}
```

---

## Phase 3: Integration with Existing Flows

### 3.1 Submission Flow (Delegate → Publisher)

**Modify:** `/Users/daniel/GitHub/ghostr/src/components/delegate/SubmitDialog.tsx`

After `await sendGiftWrappedSubmission(publisherPubkey, payload)` (line ~129):

```typescript
// Send bot notifications (fire-and-forget, don't block)
try {
  const publisherNotification = await createNewSubmissionNotification({
    delegatePubkey: user?.pubkey,
    delegateName: selectedProfile?.displayName || selectedProfile?.name,
    submissionId,
    contentPreview: draft.content,
  })
  sendBotNotification(publisherPubkey, publisherNotification)
  
  if (user?.pubkey) {
    const delegateNotification = await createSubmissionReceivedNotification({
      publisherPubkey,
      publisherName: selectedProfile?.displayName || selectedProfile?.name,
      submissionId,
    })
    sendBotNotification(user.pubkey, delegateNotification)
  }
} catch (error) {
  console.error('[SubmitDialog] Bot notification error (non-critical):', error)
}
```

### 3.2 Approval Flow (Publisher → Delegate)

**Modify:** `/Users/daniel/GitHub/ghostr/src/components/admin/PublishDialog.tsx`

After `await sendGiftWrappedReceipt(submission.delegatePubkey, receipt)` (line ~81):

```typescript
// Send bot notification (fire-and-forget)
try {
  const notification = await createApprovalNotification({
    submissionId: submission.id,
    eventId: publishedEventId,
  })
  sendBotNotification(submission.delegatePubkey, notification)
} catch (error) {
  console.error('[PublishDialog] Bot notification error (non-critical):', error)
}
```

### 3.3 Rejection Flow (Publisher → Delegate)

**Modify:** `/Users/daniel/GitHub/ghostr/src/components/admin/FeedbackDialog.tsx`

After `await sendGiftWrappedReceipt(submission.delegatePubkey, receipt)` (line ~42):

```typescript
// Send bot notification (fire-and-forget)
try {
  const notification = await createRejectionNotification({
    submissionId: submission.id,
    feedback: feedback.trim() || undefined,
  })
  sendBotNotification(submission.delegatePubkey, notification)
} catch (error) {
  console.error('[FeedbackDialog] Bot notification error (non-critical):', error)
}
```

---

## Phase 4: User Settings & Controls

### 4.1 Settings Store Extension

**Modify:** `/Users/daniel/GitHub/ghostr/src/stores/settingsStore.ts`

```typescript
interface SettingsStore {
  // ... existing fields ...
  enableBotNotifications: boolean
  setBotNotifications: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // ... existing state ...
      enableBotNotifications: true,
      setBotNotifications: (enabled) => set({ enableBotNotifications: enabled }),
    }),
    {
      name: 'ghostr-settings',
      partialize: (state) => ({
        // ... existing fields ...
        enableBotNotifications: state.enableBotNotifications,
      }),
    }
  )
)
```

### 4.2 Settings UI

**Modify:** `/Users/daniel/GitHub/ghostr/src/components/settings/SettingsPage.tsx`

Add notification settings section:

```typescript
import { isBotEnabled, getBotPubkey } from '@/lib/ndk/botSigner'
import { useEffect, useState } from 'react'

// Inside component:
const { enableBotNotifications, setBotNotifications } = useSettingsStore()
const [botPubkey, setBotPubkey] = useState<string | null>(null)

useEffect(() => {
  getBotPubkey().then(setBotPubkey)
}, [])

// Add to UI:
<div className="space-y-4">
  <div>
    <h3 className="text-lg font-medium">Notifications</h3>
    <p className="text-sm text-muted-foreground">
      Configure how you receive notifications
    </p>
  </div>
  
  <div className="flex items-center justify-between">
    <div className="space-y-0.5">
      <Label htmlFor="bot-notifications">Bot Notifications</Label>
      <p className="text-sm text-muted-foreground">
        Receive DM notifications from the Ghostr bot
        {isBotEnabled() ? ' (Compatible with all Nostr clients)' : ' (Not configured)'}
      </p>
      {botPubkey && (
        <p className="text-xs text-muted-foreground">
          Bot: {botPubkey.slice(0, 16)}...
        </p>
      )}
    </div>
    <Switch
      id="bot-notifications"
      checked={enableBotNotifications && isBotEnabled()}
      onCheckedChange={setBotNotifications}
      disabled={!isBotEnabled()}
    />
  </div>
</div>
```

### 4.3 Conditional Notification Sending

**Update:** `/Users/daniel/GitHub/ghostr/src/lib/nostr/nip04.ts`

```typescript
import { useSettingsStore } from '@/stores/settingsStore'

export function sendBotNotification(
  recipientPubkey: string,
  message: string
): void {
  const { enableBotNotifications } = useSettingsStore.getState()
  
  if (!enableBotNotifications) {
    console.log('[BotDM] Bot notifications disabled in settings')
    return
  }
  
  sendBotDM(recipientPubkey, message).catch((error) => {
    console.error('[BotDM] Notification error (non-critical):', error)
  })
}
```

---

## Phase 5: Security & Rate Limiting

### 5.1 Rate Limiting

**Create:** `/Users/daniel/GitHub/ghostr/src/lib/notifications/rateLimit.ts`

```typescript
interface RateLimitEntry {
  count: number
  windowStart: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const MAX_NOTIFICATIONS_PER_WINDOW = 5

export function checkRateLimit(recipientPubkey: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(recipientPubkey)
  
  if (!entry) {
    rateLimitMap.set(recipientPubkey, { count: 1, windowStart: now })
    return true
  }
  
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count = 1
    entry.windowStart = now
    return true
  }
  
  if (entry.count >= MAX_NOTIFICATIONS_PER_WINDOW) {
    console.warn('[RateLimit] Limit exceeded for', recipientPubkey.slice(0, 8))
    return false
  }
  
  entry.count++
  return true
}

export function cleanupRateLimitMap(): void {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key)
    }
  }
}

if (typeof window !== 'undefined') {
  setInterval(cleanupRateLimitMap, 5 * 60 * 1000)
}
```

**Integrate into nip04.ts:**

```typescript
import { checkRateLimit } from '@/lib/notifications/rateLimit'

export function sendBotNotification(
  recipientPubkey: string,
  message: string
): void {
  const { enableBotNotifications } = useSettingsStore.getState()
  
  if (!enableBotNotifications) {
    console.log('[BotDM] Bot notifications disabled in settings')
    return
  }
  
  if (!checkRateLimit(recipientPubkey)) {
    console.warn('[BotDM] Rate limit exceeded, notification dropped')
    return
  }
  
  sendBotDM(recipientPubkey, message).catch((error) => {
    console.error('[BotDM] Notification error (non-critical):', error)
  })
}
```

### 5.2 Security Documentation

**Update:** `/Users/daniel/GitHub/ghostr/README.md`

Add section:

```markdown
## Bot Notifications

Ghostr includes an optional notification bot that sends cross-client compatible DM notifications.

### Why Bot Notifications?

The primary communication method (NIP-59 gift wrap) works perfectly in Ghostr but has limited support in other Nostr clients:
- **Keychat:** Shows notification but not message body
- **Damus/Primal:** No notification at all

The bot sends supplemental NIP-04 encrypted DMs that work across all major clients.

### Setup

1. Use the vanity bot keypair: `npub1gh0strl6djhzj2h7rcvzx7x902uc5esdd7gwhkv4599aqz8m4pys8ryan3`
2. Create `.env` file:
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

Users can enable/disable bot notifications in Settings → Notifications.
```

---

## Testing Strategy

### Cross-Client Testing

**Test in these clients:**
1. **Keychat** - Verify notification + message body visible
2. **Damus (iOS)** - Verify notification appears
3. **Primal (web)** - Verify notification appears
4. **Amethyst (Android)** - Verify notification appears

### Test Scenarios

1. **Submission Flow:**
   - [ ] Delegate submits → Publisher receives DM
   - [ ] Delegate receives confirmation DM
   - [ ] Verify messages are readable in all clients

2. **Approval Flow:**
   - [ ] Publisher approves → Delegate receives DM
   - [ ] Verify event ID link included
   - [ ] Check message formatting

3. **Rejection Flow:**
   - [ ] Publisher rejects with feedback → Delegate receives DM
   - [ ] Publisher rejects without feedback → Delegate receives DM
   - [ ] Verify feedback displayed correctly

4. **Error Handling:**
   - [ ] Bot not configured → App works normally
   - [ ] Invalid bot nsec → Logs error, continues
   - [ ] Network disconnected → Doesn't block submission
   - [ ] Rapid submissions → Rate limit activates

5. **Settings:**
   - [ ] Disable notifications → No DMs sent
   - [ ] Enable notifications → DMs resume
   - [ ] Settings persist across reload

---

## Implementation Timeline

### Day 1-2: Foundation
- Create `.env.example`
- Create `botSigner.ts`
- Create `nip04.ts`
- Initialize in `main.tsx`
- Test: Verify bot can send DM

### Day 3-4: Core Integration
- Create `messageTemplates.ts`
- Modify `SubmitDialog.tsx`
- Modify `PublishDialog.tsx`
- Modify `FeedbackDialog.tsx`
- Test: Full submission flow

### Day 5: UX & Controls
- Modify `settingsStore.ts`
- Modify `SettingsPage.tsx`
- Create `rateLimit.ts`
- Test: Settings and rate limiting

### Day 6-7: Testing & Documentation
- Cross-client testing
- Error handling testing
- Update README.md
- Create additional documentation

**Total Time:** 7 days (1 developer)

---

## Critical Files Summary

### New Files (5):
1. `/Users/daniel/GitHub/ghostr/.env.example`
2. `/Users/daniel/GitHub/ghostr/src/lib/ndk/botSigner.ts`
3. `/Users/daniel/GitHub/ghostr/src/lib/nostr/nip04.ts`
4. `/Users/daniel/GitHub/ghostr/src/lib/notifications/messageTemplates.ts`
5. `/Users/daniel/GitHub/ghostr/src/lib/notifications/rateLimit.ts`

### Modified Files (7):
6. `/Users/daniel/GitHub/ghostr/src/stores/settingsStore.ts`
7. `/Users/daniel/GitHub/ghostr/src/components/delegate/SubmitDialog.tsx`
8. `/Users/daniel/GitHub/ghostr/src/components/admin/PublishDialog.tsx`
9. `/Users/daniel/GitHub/ghostr/src/components/admin/FeedbackDialog.tsx`
10. `/Users/daniel/GitHub/ghostr/src/components/settings/SettingsPage.tsx`
11. `/Users/daniel/GitHub/ghostr/src/main.tsx`
12. `/Users/daniel/GitHub/ghostr/README.md`

---

## Success Criteria

### Technical:
- ✅ Bot initialization success rate > 99%
- ✅ DM send success rate > 95%
- ✅ No blocking delays in workflow
- ✅ Rate limit prevents spam (5/min)

### User Experience:
- ✅ Notifications visible in Keychat
- ✅ Notifications visible in Damus
- ✅ Notifications visible in Primal
- ✅ Messages are clear and actionable
- ✅ Users can disable without issues

---

## Risk Mitigation

### High Risk: NIP-04 vs NIP-44 Compatibility
- **Risk:** NDK may default to NIP-44
- **Impact:** Messages unreadable in older clients
- **Mitigation:** Test early, use nostr-tools if needed

### Medium Risk: Bot Key Exposure
- **Risk:** Client-side nsec visible in bundle
- **Impact:** Potential spam if abused
- **Mitigation:** Rate limiting, user controls, clear documentation

### Low Risk: Cross-Client Compatibility
- **Risk:** DMs may not render correctly
- **Impact:** Poor UX in some clients
- **Mitigation:** Test across 3+ clients before launch

---

## Rollback Plan

1. **Quick Disable:** Set `enableBotNotifications: false` in settings default
2. **Environment Disable:** Remove `VITE_BOT_NSEC` from environment
3. **Code Rollback:** Revert bot integration commits
4. **Emergency:** Block bot pubkey on relay level (if compromised)

---

## Future Enhancements

1. **Notification Center UI** - In-app notification history
2. **Advanced Preferences** - Per-notification-type toggles
3. **Deep Linking** - Direct links to submissions/events
4. **Server-Side Bot** - Remove nsec from client (if budget allows)

---

**End of Implementation Plan**
