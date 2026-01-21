# Keychat Integration Dev Notes

**Date**: 2026-01-20
**Status**: In Progress - Blocked on `getPublicKey()` returning null

## Problem Statement

Ghostr freezes instantly when signing in via Keychat's in-app browser (Flutter WebView), while other Nostr apps work fine with Keychat's NIP-07 signing.

## Investigation Summary

### What We Discovered

1. **Keychat uses Flutter as its internal browser** and provides `window.nostr` for NIP-07 signing
2. **The original freeze was caused by** the Keychat shim trying to use `flutter_inappwebview.callHandler("keychat-nostr", ...)` with 15-second timeouts per operation
3. **Current blocker**: `window.nostr.getPublicKey()` returns `null` instead of the user's pubkey

### Diagnostic Results from Keychat

```
window.nostr          present
nip04                 yes
nip44                 yes
getPublicKey          null is not an object (evaluating 'ye.slice')
nip44 roundtrip       skipped
```

The error was due to our code trying to call `.slice()` on null - now fixed. The real issue is that `getPublicKey()` returns null.

## Changes Made

### 1. Simplified Keychat Shim (`src/lib/keychatShim.ts`)

**Before**: Tried to call `flutter_inappwebview.callHandler("keychat-nostr", "signEvent/nip44Decrypt/etc", ...)` with 15-second timeout, then fell back to `window.nostr`.

**After**: Uses `window.nostr` methods directly with a serialization queue to prevent concurrent prompts. Key characteristics:
- Queue system prevents multiple simultaneous signing prompts
- 100ms delay between operations (reduced from 200ms)
- No more 15-second timeouts per operation
- Only wraps `signEvent`, `nip04.*`, and `nip44.*` - NOT `getPublicKey`

### 2. Added Diagnostic Logging

- `src/main.tsx`: Logs `flutter_inappwebview` and `window.nostr` availability at startup
- `src/stores/authStore.ts`: Logs during login with environment detection and NIP-44 availability
- `src/stores/draftStore.ts`: Logs when draft loading starts
- `src/lib/nostr/nip37.ts`: Logs each draft decrypt operation with progress
- `src/lib/keychatShim.ts`: Logs shim application and each queued operation

### 3. Fixed Null Handling

- `src/components/auth/NIP07Login.tsx`: Fixed diagnostics to handle null pubkey without crashing
- `src/lib/ndk/signers.ts`: Improved error message when pubkey is null

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/keychatShim.ts` | Serializes NIP-07 operations for Flutter WebView |
| `src/lib/ndk/signers.ts` | NIP-07 signer creation, `WindowNostrSigner` class |
| `src/stores/authStore.ts` | Login flow, session restoration |
| `src/stores/draftStore.ts` | Draft loading (triggers many decrypts) |
| `src/lib/nostr/nip37.ts` | NIP-37 draft storage with NIP-44 encryption |
| `src/components/auth/NIP07Login.tsx` | Login UI with diagnostics |

## Architecture: How Ghostr Uses NIP-07

1. **Login Flow**:
   - User clicks "Login with Extension"
   - `loginWithNIP07()` in authStore creates signer
   - For in-app: Uses `WindowNostrSigner` (direct `window.nostr` calls)
   - For desktop: Uses `NDKNip07Signer` (NDK's built-in)
   - Gets pubkey via `getPublicKey()`
   - Sets NDK signer, marks authenticated

2. **Post-Login**:
   - Dashboard mounts and calls `loadDrafts()`
   - Drafts are fetched from relay (kind 31234)
   - Each draft is decrypted with `signer.decrypt(user, content, "nip44")`
   - With Keychat shim, decrypts are serialized through queue

3. **What Makes Ghostr Different**:
   - Uses NIP-44 encryption for drafts (not just NIP-04)
   - Loads/decrypts multiple drafts immediately after login
   - Has Ghost Notes feature with encrypted messages

## Open Questions

1. **Why does Keychat return null from `getPublicKey()`?**
   - Does Keychat require explicit approval that we're not triggering?
   - Is there a different initialization sequence needed?
   - Does Keychat expect apps to use `callHandler` for `getPublicKey` too?

2. **What do other apps do differently?**
   - They might not call `getPublicKey()` immediately
   - They might use a different signer detection flow
   - They might handle the null case differently

## Next Steps

1. Test with updated code to see new diagnostic output
2. Check if Keychat shows any approval popup when connecting
3. Look in Keychat settings for web app permissions
4. Consider reaching out to Keychat developers about expected NIP-07 flow
5. Test if calling `callHandler("keychat-nostr", "getPublicKey")` works instead

## Related Commits

- `3cfe13e`: Serialize Keychat crypto calls and force NIP-44 drafts
- `fe98298`: Queue Keychat signEvent calls and simplify NIP-07 diagnostics
- `d00d6c0`: Use window.nostr signer for in-app NIP-07

## Environment Detection

```typescript
// How we detect Keychat/Flutter WebView
export function isInAppWebView(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as typeof window & { flutter_inappwebview?: unknown };
  if (w.flutter_inappwebview) return true;
  if (typeof navigator === "undefined") return false;
  return /keychat/i.test(navigator.userAgent);
}
```
