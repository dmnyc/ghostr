/**
 * Keychat Shim - Serializes NIP-07 operations in Flutter WebView
 *
 * Problem: Keychat's in-app browser can only handle one signing prompt at a time.
 * If multiple decrypt/sign operations are triggered concurrently, the UI freezes.
 *
 * Solution: Queue all NIP-07 operations and process them serially.
 * We use window.nostr methods directly (not callHandler) since window.nostr
 * is the standard NIP-07 interface that Keychat implements.
 */

export function initializeKeychatShim(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & {
    flutter_inappwebview?: unknown;
  };

  const applyShim = () => {
    const nostr =
      (w.nostr as typeof window.nostr & { __ghostrShim?: boolean }) ??
      undefined;

    // Only apply shim if we're in a Flutter WebView and have window.nostr
    if (!w.flutter_inappwebview || !nostr) return false;
    if (nostr.__ghostrShim) return true;

    console.log("[KeychatShim] Applying shim for Flutter WebView");

    type NostrSignEvent = NonNullable<
      NonNullable<typeof window.nostr>["signEvent"]
    >;
    type Nip04 = NonNullable<NonNullable<typeof window.nostr>["nip04"]>;
    type Nip44 = NonNullable<NonNullable<typeof window.nostr>["nip44"]>;

    // Queue system to serialize all NIP-07 operations
    let processing = false;
    const queueDelayMs = 100; // Small delay between operations to let UI breathe
    const queue: {
      label: string;
      run: () => Promise<unknown>;
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }[] = [];

    const enqueue = <T>(label: string, run: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        queue.push({
          label,
          run: run as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        processQueue();
      });

    const processQueue = async () => {
      if (processing || queue.length === 0) return;
      processing = true;

      const item = queue.shift();
      if (!item) {
        processing = false;
        return;
      }

      // Small delay to prevent UI blocking
      await new Promise((resolve) => setTimeout(resolve, queueDelayMs));

      try {
        console.log(`[KeychatShim] Processing: ${item.label}`);
        const result = await item.run();
        item.resolve(result);
      } catch (error) {
        console.warn(`[KeychatShim] Failed: ${item.label}`, error);
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }

      processing = false;
      // Process next item in queue
      processQueue();
    };

    // Wrap signEvent to serialize signing requests
    const originalSignEvent = nostr.signEvent?.bind(nostr) as
      | NostrSignEvent
      | undefined;
    if (originalSignEvent) {
      nostr.signEvent = (event) =>
        enqueue("signEvent", () => originalSignEvent(event));
    }

    // Wrap NIP-04 encrypt/decrypt
    const nip04 = nostr.nip04;
    if (nip04?.encrypt) {
      const originalEncrypt = nip04.encrypt.bind(nip04) as Nip04["encrypt"];
      nip04.encrypt = (pubkey, plaintext) =>
        enqueue("nip04.encrypt", () => originalEncrypt(pubkey, plaintext));
    }
    if (nip04?.decrypt) {
      const originalDecrypt = nip04.decrypt.bind(nip04) as Nip04["decrypt"];
      nip04.decrypt = (pubkey, ciphertext) =>
        enqueue("nip04.decrypt", () => originalDecrypt(pubkey, ciphertext));
    }

    // Wrap NIP-44 encrypt/decrypt
    const nip44 = nostr.nip44;
    if (nip44?.encrypt) {
      const originalEncrypt = nip44.encrypt.bind(nip44) as Nip44["encrypt"];
      nip44.encrypt = (pubkey, plaintext) =>
        enqueue("nip44.encrypt", () => originalEncrypt(pubkey, plaintext));
    }
    if (nip44?.decrypt) {
      const originalDecrypt = nip44.decrypt.bind(nip44) as Nip44["decrypt"];
      nip44.decrypt = (pubkey, ciphertext) =>
        enqueue("nip44.decrypt", () => originalDecrypt(pubkey, ciphertext));
    }

    nostr.__ghostrShim = true;
    console.log("[KeychatShim] Shim applied successfully");
    return true;
  };

  // Try to apply immediately
  if (applyShim()) return;

  // Poll for window.nostr (Keychat may inject it after page load)
  const start = Date.now();
  const pollIntervalMs = 250;
  const timeoutMs = 10000;
  const timer = setInterval(() => {
    if (applyShim() || Date.now() - start > timeoutMs) {
      clearInterval(timer);
    }
  }, pollIntervalMs);

  // Also listen for Flutter ready event
  window.addEventListener?.("flutterInAppWebViewPlatformReady", () => {
    applyShim();
  });
}
