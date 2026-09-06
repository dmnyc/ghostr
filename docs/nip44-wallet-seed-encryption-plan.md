# NIP-44 Encryption for Spark Wallet Seed Phrase

## Context

PR #3 (`feature/lightning-payment-unlock`) stores the wallet mnemonic seed in plaintext localStorage via Zustand persist. The field is named `encryptedSeed` but contains raw plaintext. We're adding NIP-44 self-encryption so that localStorage alone doesn't expose the seed. This follows the same encrypt-to-self pattern already used for drafts (NIP-37) and app state (NIP-78) throughout the codebase.

## Approach

**Encrypt-to-self on store, decrypt-to-memory on session restore.**

- Seed + API key get NIP-44 encrypted before hitting localStorage
- On page reload, decryption happens once after auth session restores the signer
- Plaintext lives only in non-persisted Zustand state during the session
- Cleared on logout/disconnect

## Files to Modify

### 1. `src/stores/walletStore.ts` (on `feature/lightning-payment-unlock`)

**Add new state fields:**
- `encryptedApiKey: string | null` — NIP-44 ciphertext (API key is also sensitive)
- `_plaintextSeed: string | null` — in-memory only, never persisted
- `_plaintextApiKey: string | null` — in-memory only, never persisted
- `_decrypted: boolean` — whether credentials have been decrypted this session

**Add new actions:**
- `decryptCredentials(): Promise<boolean>` — reads `encryptedSeed`/`encryptedApiKey` from persisted state, decrypts via `signer.decrypt(user, ciphertext, "nip44")`, stores plaintext in `_plaintextSeed`/`_plaintextApiKey`
- `_encryptAndStore(mnemonic, apiKey)` — encrypts via `signer.encrypt(user, plaintext, "nip44")`, writes ciphertext to `encryptedSeed`/`encryptedApiKey`

**Modify `setupWallet`:**
- After `connectWallet()` succeeds, call `_encryptAndStore()` to encrypt before persisting
- Fallback: if NIP-44 encrypt fails (old extension), store plaintext with console warning

**Modify `connect`:**
- Read from `_plaintextSeed`/`_plaintextApiKey` instead of `encryptedSeed`
- If not yet decrypted, call `decryptCredentials()` first

**Modify `clearWallet`:**
- Also null out `_plaintextSeed`, `_plaintextApiKey`, `encryptedApiKey`, reset `_decrypted`

**Modify `partialize`:**
- Add `encryptedApiKey` to persisted fields
- Remove `apiKey` (replaced by `encryptedApiKey`)
- Never persist `_plaintext*` or `_decrypted`

**Legacy migration in `decryptCredentials`:**
- If NIP-44 decrypt fails, check if stored value looks like plaintext (contains spaces = mnemonic words)
- If plaintext detected, use directly and re-encrypt in-place via `_encryptAndStore`
- This transparently migrates users who set up wallet before this change

### 2. `src/stores/authStore.ts`

**In `restoreSession`** (after `loginWithNIP07()` succeeds):
- Check if `walletStore.encryptedSeed` exists
- If so, call `walletStore.decryptCredentials()`
- If decrypt succeeds, call `walletStore.connect()` (fire-and-forget, non-blocking)

**In `logout`:**
- Call `useWalletStore.getState().clearWallet()` to wipe in-memory secrets
- Add `import { useWalletStore } from "./walletStore"` (follows existing pattern — authStore already imports draftStore and submissionStore)

### 3. No changes needed

- `src/lib/lightning/sparkWallet.ts` — only receives plaintext from memory, never touches localStorage
- `src/components/lightning/WalletSetup.tsx` — calls `setupWallet()` which handles encryption internally
- `src/components/lightning/PaymentGate.tsx` — unrelated to seed storage

## Data Flow

```
Setup:  UI -> setupWallet(mnemonic, apiKey)
              -> connectWallet(mnemonic, apiKey)     [Spark SDK, in memory]
              -> _encryptAndStore(mnemonic, apiKey)
                 -> signer.encrypt(user, mnemonic, "nip44")
                 -> signer.encrypt(user, apiKey, "nip44")
              -> Zustand persist writes ciphertext to localStorage

Reload: NDK connects -> restoreSession() -> loginWithNIP07()
              -> decryptCredentials()
                 -> signer.decrypt(user, encryptedSeed, "nip44")
                 -> signer.decrypt(user, encryptedApiKey, "nip44")
                 -> _plaintextSeed/_plaintextApiKey set in memory
              -> connect()
                 -> connectWallet(_plaintextSeed, _plaintextApiKey)

Logout: authStore.logout()
              -> walletStore.clearWallet()
                 -> disconnectWallet()
                 -> null out all _plaintext* and encrypted* fields
```

## Verification

1. **Setup**: After wallet setup, inspect DevTools > Application > Local Storage > `ghostr-wallet`. `encryptedSeed` should be base64 ciphertext, not English words
2. **Reload**: After page refresh, wallet should auto-reconnect without re-entering seed
3. **Logout**: After logout, `ghostr-wallet` localStorage should have null `encryptedSeed`
4. **Console check**: `useWalletStore.getState()._plaintextSeed` should be null before login, populated after
5. **Migration**: If plaintext seed exists from before this change, it should auto-encrypt on first login
6. **Build**: `npm run build` should compile clean
