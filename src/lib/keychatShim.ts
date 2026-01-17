export function initializeKeychatShim(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & {
    flutter_inappwebview?: {
      callHandler?: (name: string, ...args: unknown[]) => Promise<unknown>;
    };
  };

  const applyShim = () => {
    const nostr =
      (w.nostr as typeof window.nostr & { __ghostrShim?: boolean }) ??
      undefined;
    if (!w.flutter_inappwebview?.callHandler || !nostr) return false;
    if (nostr.__ghostrShim) return true;

    const callHandler = w.flutter_inappwebview.callHandler.bind(
      w.flutter_inappwebview,
    );

    const withTimeout = async <T>(
      promise: Promise<T>,
      timeoutMs: number,
      label: string,
    ): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }) as Promise<T>;
    };

    type NostrSignEvent = NonNullable<
      NonNullable<typeof window.nostr>["signEvent"]
    >;
    type NostrEventParam = Parameters<NostrSignEvent>[0];
    type NostrSignedEvent = Awaited<ReturnType<NostrSignEvent>>;
    type Nip04 = NonNullable<NonNullable<typeof window.nostr>["nip04"]>;
    type Nip44 = NonNullable<NonNullable<typeof window.nostr>["nip44"]>;

    let signing = false;
    const queueDelayMs = 200;
    const handlerTimeoutMs = 15000;
    const queue: {
      run: () => Promise<unknown>;
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
    }[] = [];

    const originalSignEvent = nostr.signEvent?.bind(nostr) as
      | NostrSignEvent
      | undefined;

    const enqueue = <T>(run: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        queue.push({
          run: run as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        processQueue();
      });

    const signWithHandler = async (
      event: NostrEventParam,
    ): Promise<NostrSignedEvent> => {
      await new Promise((resolve) => setTimeout(resolve, queueDelayMs));
      const res = await withTimeout(
        callHandler("keychat-nostr", "signEvent", event),
        handlerTimeoutMs,
        "keychat signEvent",
      );
      let parsed: unknown = res;
      if (typeof res === "string") {
        try {
          parsed = JSON.parse(res);
        } catch {
          parsed = res;
        }
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        "sig" in (parsed as Record<string, unknown>)
      ) {
        return parsed as NostrSignedEvent;
      }
      throw new Error("Failed to sign event");
    };

    const processQueue = async () => {
      if (signing || queue.length === 0) return;
      signing = true;
      const item = queue.shift();
      if (!item) {
        signing = false;
        return;
      }

      try {
        const signed = await item.run();
        item.resolve(signed);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }

      signing = false;
      processQueue();
    };

    // Queue sign requests to avoid concurrent in-app signer prompts.
    const queuedSignEvent: NostrSignEvent = (event) =>
      enqueue(async () => {
        try {
          return await signWithHandler(event);
        } catch (error) {
          if (!originalSignEvent) {
            throw error;
          }
          return originalSignEvent(event);
        }
      });
    nostr.signEvent = queuedSignEvent;

    const nip04 = nostr.nip04;
    if (nip04?.encrypt) {
      const originalEncrypt = nip04.encrypt.bind(nip04) as
        | Nip04["encrypt"]
        | undefined;
      nip04.encrypt = (pubkey, plaintext) =>
        enqueue(async () => {
          try {
            const res = await withTimeout(
              callHandler("keychat-nostr", "nip04Encrypt", pubkey, plaintext),
              handlerTimeoutMs,
              "keychat nip04 encrypt",
            );
            return typeof res === "string" ? res : String(res ?? "");
          } catch (error) {
            if (!originalEncrypt) {
              throw error;
            }
            return originalEncrypt(pubkey, plaintext);
          }
        });
    }

    if (nip04?.decrypt) {
      const originalDecrypt = nip04.decrypt.bind(nip04) as
        | Nip04["decrypt"]
        | undefined;
      nip04.decrypt = (pubkey, ciphertext) =>
        enqueue(async () => {
          try {
            const res = await withTimeout(
              callHandler("keychat-nostr", "nip04Decrypt", pubkey, ciphertext),
              handlerTimeoutMs,
              "keychat nip04 decrypt",
            );
            return typeof res === "string" ? res : String(res ?? "");
          } catch (error) {
            if (!originalDecrypt) {
              throw error;
            }
            return originalDecrypt(pubkey, ciphertext);
          }
        });
    }

    const nip44 = nostr.nip44;
    if (nip44?.encrypt) {
      const originalEncrypt = nip44.encrypt.bind(nip44) as
        | Nip44["encrypt"]
        | undefined;
      nip44.encrypt = (pubkey, plaintext) =>
        enqueue(async () => {
          try {
            const res = await withTimeout(
              callHandler("keychat-nostr", "nip44Encrypt", pubkey, plaintext),
              handlerTimeoutMs,
              "keychat nip44 encrypt",
            );
            return typeof res === "string" ? res : String(res ?? "");
          } catch (error) {
            if (!originalEncrypt) {
              throw error;
            }
            return originalEncrypt(pubkey, plaintext);
          }
        });
    }

    if (nip44?.decrypt) {
      const originalDecrypt = nip44.decrypt.bind(nip44) as
        | Nip44["decrypt"]
        | undefined;
      nip44.decrypt = (pubkey, ciphertext) =>
        enqueue(async () => {
          try {
            const res = await withTimeout(
              callHandler("keychat-nostr", "nip44Decrypt", pubkey, ciphertext),
              handlerTimeoutMs,
              "keychat nip44 decrypt",
            );
            return typeof res === "string" ? res : String(res ?? "");
          } catch (error) {
            if (!originalDecrypt) {
              throw error;
            }
            return originalDecrypt(pubkey, ciphertext);
          }
        });
    }

    nostr.__ghostrShim = true;
    return true;
  };

  if (applyShim()) return;

  const start = Date.now();
  const pollIntervalMs = 250;
  const timeoutMs = 10000;
  const timer = setInterval(() => {
    if (applyShim() || Date.now() - start > timeoutMs) {
      clearInterval(timer);
    }
  }, pollIntervalMs);

  window.addEventListener?.("flutterInAppWebViewPlatformReady", () => {
    applyShim();
  });
}
