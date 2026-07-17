# Ghostr Code Review & Lightning Payment Unlock Feature Plan

**Date:** February 25, 2026  
**Repo:** https://github.com/dmnyc/ghostr  
**Version reviewed:** 0.7.1

---

## 1. Executive Summary

Ghostr is a well-structured React/TypeScript Nostr delegation app at **prototype-to-MVP stage**. The core delegation workflow (writer → publisher approval → publish) works. Ghost Notes (ephemeral encrypted messages) are implemented. The codebase is clean, uses modern patterns (Zustand, NDK, NIP-44/59), and is a solid foundation to iterate on — **not a rebuild candidate**.

**Verdict: Iterate. Don't rebuild.**

---

## 2. Architecture Overview

| Layer | Tech | Assessment |
|-------|------|------------|
| **Frontend** | React 19 + Vite 7 + TypeScript | Modern, fast |
| **State** | Zustand with persist middleware | Clean, well-structured stores |
| **Nostr** | NDK 2.18 + nostr-tools 2.19 | Proper NIP implementations |
| **Encryption** | NIP-44 (modern) via NDK signer | Correct approach |
| **Gift Wrap** | NIP-59/NIP-17 with ephemeral keys | Well-implemented |
| **Media** | Blossom SDK for image uploads | Functional |
| **UI** | Tailwind + shadcn/ui + Radix | Solid component library |
| **Routing** | React Router 7 | Standard |
| **Caching** | React Query + sync storage persister | Good for offline |

### Key Files Reviewed
- `src/lib/nostr/nip59.ts` — Gift wrap send/unwrap (NIP-17 compliant)
- `src/lib/nostr/ghostNote.ts` — Ghost Note CRUD + encryption
- `src/lib/nostr/nip04.ts` — Bot notification DMs
- `src/stores/ghostNoteStore.ts` — Zustand store with persistence
- `src/stores/authStore.ts` — NIP-07 + nsec auth with session restore
- `src/App.tsx` — Routing with protected routes

---

## 3. What Works Well

### ✅ Solid
- **NIP-59 gift wrap implementation** — Proper rumor→seal→wrap with ephemeral keys, randomized timestamps per NIP-17
- **NIP-44 encryption** — Modern encryption with timeout wrappers to handle flaky signers
- **Ghost Notes** — Full lifecycle: create, encrypt, publish, fetch, decrypt, revoke (kind 5 deletion), expire
- **Auth** — NIP-07 browser extension + nsec fallback, session restore, Keychat in-app browser workarounds
- **Bot notification system** — Rate-limited NIP-04 DMs for cross-client compatibility
- **State management** — Clean Zustand stores with persistence, user-scoped queries, deduplication
- **Error handling** — Timeouts on all async operations, graceful fallbacks

### ✅ Good Patterns
- Fire-and-forget notifications with `Promise.race` timeouts
- Content cleared from memory after read (burn-after-reading)
- UUID + d-tag dual identification for Ghost Notes
- Protocol versioning in gift wrap payloads

---

## 4. Issues & Gaps

### ⚠️ Moderate Issues
1. **Bot nsec in client bundle** — The README acknowledges this. Acceptable for notification-only bot, but limits bot capabilities. If Lightning features need server-side logic, this needs rethinking.
2. **No server component** — Everything is client-side. Lightning invoices will require at minimum a wallet runtime or relay-based coordination.
3. **Ghost Note 500 char limit** — Arbitrary constraint in `validateGhostNoteInput`. Fine for secrets, but limits use for paid content.
4. **Expiration enforcement is client-side only** — NIP-40 `expiration` tag is advisory; relays *may* honor it but aren't required to. The encrypted content persists on relays until they prune.
5. **No test suite** — Zero tests. For a privacy/security tool, this is a risk.

### ⚠️ Minor Issues
6. **Publish timeout race** — `Promise.race([publish, timeout])` resolves on timeout without knowing if publish succeeded. No retry logic.
7. **Ghost Note kind 30079** — Non-standard kind. Fine for Ghostr-only ecosystem, but limits interop.
8. **SQL schema in spec but Zustand in code** — The ghost-note-spec.md references SQL tables, but the actual implementation uses Zustand + localStorage. Spec is aspirational, not current.
9. **NIP-07 only for encryption** — No NIP-46 (Nostr Connect/remote signer) support, which would be better for mobile.

---

## 5. Lightning Payment Unlock — Feature Plan

### Concept
Sender encrypts content → attaches Lightning invoice → receiver pays → content unlocks. Self-custodial, trustless, censorship-resistant.

### UX Flow

```
SENDER (Dissident/Creator):
1. Settings → Configure Lightning Wallet
   - Enter Breez SDK API key or Spark wallet connection
   - Wallet generates/stores seed locally (exportable)
   
2. Create Ghost Note (or delegation submission)
   - Toggle "Require Payment" 
   - Set price in sats (e.g., 1000 sats)
   - Content encrypted as usual with NIP-44
   
3. On submit:
   - App generates HODL invoice via wallet SDK
   - Invoice + payment hash embedded in Ghost Note tags
   - Encrypted content key split: half in note, half released on payment

RECEIVER (Supporter):
1. Opens Ghost Note link
2. Sees: "🔒 This note requires 1000 sats to unlock"
3. Scans/copies Lightning invoice
4. Pays from any Lightning wallet
5. Payment settles → preimage revealed
6. Preimage used to derive decryption key → content unlocks
```

### Technical Approach

#### Option A: HODL Invoice Atomic Exchange (Recommended)
Best for trustlessness. No server needed if using Breez SDK.

```
Event Structure (extended Ghost Note):
{
  kind: 30079,
  tags: [
    ["d", "ghost_..."],
    ["p", "<recipient>"],
    ["expiration", "<unix>"],
    ["lightning", "lnbc1..."],          // BOLT11 invoice
    ["payment-hash", "<hash>"],          // For verification
    ["price", "1000"],                   // Sats
    ["encrypted-key-hint", "<partial>"], // Half of content key
    ["t", "ghost-note"],
    ["t", "paid-content"]
  ],
  content: "<nip44-encrypted-with-derived-key>"
}
```

**Key derivation:**
- Content encrypted with a random symmetric key `K`
- `K = HMAC-SHA256(payment_preimage, content_nonce)`
- Payment preimage only known after invoice is paid
- Sender knows preimage (created the invoice), so can always decrypt
- Receiver gets preimage from Lightning payment settlement

**Flow:**
1. Sender creates invoice via Breez/Spark SDK (client-side)
2. Sender encrypts content with key derived from preimage
3. Publishes Ghost Note with invoice in tags
4. Receiver pays invoice → gets preimage from payment
5. Receiver derives key from preimage → decrypts content

#### Option B: Relay-Mediated (Simpler, less trustless)
Content stays NIP-44 encrypted to recipient. A "payment confirmation" event (new kind) from sender's wallet triggers content release. Requires sender to be online or use a relay bot.

### Wallet Integration Options

| Wallet SDK | Self-Custodial | Client-Side | Invoice Gen | HODL Invoice | Notes |
|------------|---------------|-------------|-------------|--------------|-------|
| **Breez SDK (Liquid)** | ✅ | ✅ (WASM) | ✅ | ❌ (Liquid swaps) | Best UX, seed exportable, but Liquid-based |
| **Spark (proposed)** | ✅ | ✅ | ✅ | ❓ | Newer, promising |
| **LDK** | ✅ | ✅ (WASM) | ✅ | ✅ | Most flexible, most work |
| **Cashu (ecash)** | ⚠️ Mint trust | ✅ | N/A | N/A | Simplest integration, but custodial trust |

**Recommendation:** Start with **Breez SDK (Liquid)** for fastest path to working product. The WASM SDK runs client-side, seed is exportable, and it handles channel management. HODL invoices aren't available on Liquid, so use Option B flow initially with Breez, then add LDK-based Option A for true atomic exchange later.

### Implementation Phases

**Phase 1: Basic Paid Ghost Notes (2-3 weeks)**
- Integrate Breez SDK WASM into Vite build
- Add wallet setup flow in Settings
- Extend Ghost Note creation with price + invoice
- Add payment verification on receiver side
- New `paymentStore.ts` Zustand store

**Phase 2: Trustless Atomic Exchange (2-3 weeks)**
- Implement HODL invoice flow with LDK or when Breez supports it
- Preimage-based content key derivation
- Payment proof stored on Nostr (new event kind for receipts)

**Phase 3: Paid Delegation Content (1-2 weeks)**
- Extend existing delegation workflow
- Publisher sets price on approved content
- Payment splits (publisher + writer shares)

### New Files Needed
```
src/lib/lightning/
  breezWallet.ts      — Breez SDK wrapper
  invoiceGenerator.ts — Create invoices with metadata
  paymentVerifier.ts  — Verify preimage/payment
  keyDerivation.ts    — Preimage → content key
src/stores/
  walletStore.ts      — Wallet state, balance, seed backup
  paymentStore.ts     — Payment history, pending invoices
src/components/lightning/
  WalletSetup.tsx     — Onboarding flow
  PaymentGate.tsx     — "Pay to unlock" UI
  InvoiceDisplay.tsx  — QR code + copy
  PaymentHistory.tsx  — Transaction list
```

---

## 6. Overall Assessment

### Strengths
- **Clean, modern codebase** — Easy to extend
- **Correct Nostr primitives** — NIP-44/59 done right
- **Good separation of concerns** — lib/nostr for protocol, stores for state, components for UI
- **Ghost Notes are a unique differentiator** — No other Nostr app has this
- **Privacy-first design** — Content only decryptable by intended parties

### Weaknesses
- **No tests** — Critical for security-sensitive code
- **No server component** — Limits what's possible for async operations
- **Client-only expiration** — Relays can keep expired content
- **Single developer patterns** — Some code duplication (gift wrap send/receipt are nearly identical)

### Recommendation

**Iterate on this codebase. Do not rebuild.**

The architecture is sound. The Nostr primitives are correctly implemented. Adding Lightning is an extension, not a rearchitecture. Priority order:

1. **Add tests** for encryption/decryption and gift wrap flows
2. **Integrate Breez SDK** for basic paid Ghost Notes
3. **Remove 500 char limit** for paid content use case
4. **Add NIP-46 support** for better mobile UX
5. **Build payment verification** flow
6. **Apply for HRF grant** with working demo of paid Ghost Notes

### HRF Grant Positioning
The combination of:
- Encrypted delegation (dissident → publisher without key sharing)
- Ephemeral Ghost Notes (burn-after-reading for sensitive comms)
- Lightning-gated content (self-custodial monetization for oppressed creators)

...is a compelling story for HRF. The key differentiator vs. existing tools is that **content stays encrypted on relays** and **payments go directly to the creator's self-custodial wallet**. No platform, no middleman, no censorship point.
