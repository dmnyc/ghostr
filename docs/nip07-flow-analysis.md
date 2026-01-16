NIP-07 flow in this app
- `src/lib/ndk/signers.ts` → `createNIP07Signer()` instantiates `NDKNip07Signer` and calls `blockUntilReady()`, which in NDK (node_modules/@nostr-dev-kit/ndk/dist/index.mjs) waits up to 1s for `window.nostr`, then calls `window.nostr.getPublicKey()` and keeps the user object in memory. `hasNIP07Extension()` is a one-time `!!window.nostr` check at render; if the signer injects after the page loads (common on mobile/WebView), the “Connect with Extension” button stays disabled.
- Once logged in, the signer is stored in Zustand (`src/stores/authStore.ts`) and copied onto the shared NDK instance so all fetch/sign/encrypt calls route through the NIP-07 provider.
- Encryption/decryption paths always use the signer: ghost notes (`src/lib/nostr/ghostNote.ts`) call `signer.encrypt`/`signer.decrypt`; gift-wrap unwrap (`src/lib/nostr/nip59.ts`) decrypts twice via `signer.decrypt`.
- NDK’s NIP-07 signer uses `window.nostr.signEvent`, `window.nostr.getRelays?()`, and `window.nostr.nip04.encrypt/decrypt` by default. It only switches to `nip44` if `window.nostr.nip44` exists and the caller explicitly asks for it; this app never requests nip44, so everything is nip04-based.

Why Nostash iOS / Keychat can hang or fail
- Injection timing: both apps often inject `window.nostr` only after a user gesture/connection handshake. Because `hasNIP07Extension()` is evaluated once on render, the login button can be stuck disabled even if the signer appears moments later. Even when the button is pressed, NDK aborts after a 1s timeout if `window.nostr` isn’t present yet.
- Missing nip04: ghost notes and gift-wrap require nip04 encrypt/decrypt. If the signer only exposes nip44 (or no nip04 at all), `signer.encrypt/decrypt` rejects with “nip04encryption is not available…” and ghost-note decrypt/publish will fail. Received ghost notes rely on a pending `ndk.fetchEvents` + decrypt; with no nip04 support this results in the decrypt step never succeeding (UI stays on the loading/decrypt spinner).
- Relay access: `ndk.fetchEvents` in several places (e.g., `fetchReceivedGhostNotes` in `ghostNote.ts`, draft/submission history) has no timeout. If the WebView blocks websockets or the signer doesn’t expose `getRelays`/relay permissions, the fetch promise can sit pending, leaving the page stuck on “Loading…” indefinitely.
- Multiple decrypts per action: gift-wrap unwrap does two sequential decrypts (outer wrapper from the ephemeral sender, then the sealed rumor). Mobile signers that throttle concurrent calls or require fresh user confirmation on each nip04 decrypt can appear to hang while waiting for repeated prompts.
- Session restore: on load, the app immediately calls `initializeNDK()` and then `restoreSession()`; if `window.nostr` isn’t ready yet (common on iOS), restoring a saved “nip07” session will fail silently and leave the app showing the loading state with no signer attached.

Likely repro path on mobile signers
1) Open the app inside Nostash or Keychat; `window.nostr` isn’t injected at first → login button disabled or login attempt fails after the 1s wait.
2) Even if login succeeds, nip04 may be absent, so ghost-note decrypt and gift-wrap unwrap reject; UI shows a perpetual decrypt spinner.
3) If websockets can’t open or relays aren’t returned, first `ndk.fetchEvents` never resolves, so the initial dashboard/ghost-notes list never leaves the loading state.

Follow-ups I’d suggest
1) Re-test with console logging to confirm which nostr capabilities exist (`getPublicKey`, `signEvent`, `nip04`, `nip44`, `getRelays`) inside Nostash and Keychat.
2) Add timeouts/fallbacks around `ndk.fetchEvents` and ghost-note decrypt so the UI can fail fast instead of hanging.
3) Consider opting into nip44 when available and detecting missing nip04 to show a clear error (“Your signer only supports nip44; Ghostr currently needs nip04”) instead of spinning forever.
4) Make the NIP-07 detection reactive (re-check `window.nostr` after user interaction) and increase the wait in `createNIP07Signer` for slower mobile injections.