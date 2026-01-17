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

    type NostrSignEvent = NonNullable<
      NonNullable<typeof window.nostr>["signEvent"]
    >;
    type NostrEventParam = Parameters<NostrSignEvent>[0];
    type NostrSignedEvent = Awaited<ReturnType<NostrSignEvent>>;

    let signing = false;
    const queue: {
      event: NostrEventParam;
      resolve: (value: NostrSignedEvent) => void;
      reject: (reason?: Error) => void;
    }[] = [];

    const originalSignEvent = nostr.signEvent?.bind(nostr) as
      | NostrSignEvent
      | undefined;

    const signWithHandler = async (
      event: NostrEventParam,
    ): Promise<NostrSignedEvent> => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const res = await callHandler("keychat-nostr", "signEvent", event);
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
        const signed = await signWithHandler(item.event);
        item.resolve(signed);
      } catch (error) {
        if (originalSignEvent) {
          try {
            const signed = await originalSignEvent(item.event);
            item.resolve(signed);
          } catch (fallbackError) {
            item.reject(
              fallbackError instanceof Error
                ? fallbackError
                : new Error(String(fallbackError)),
            );
          }
        } else {
          item.reject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      }

      signing = false;
      processQueue();
    };

    // Queue sign requests to avoid concurrent in-app signer prompts.
    const queuedSignEvent: NostrSignEvent = (event) =>
      new Promise<NostrSignedEvent>((resolve, reject) => {
        queue.push({ event, resolve, reject });
        processQueue();
      });
    nostr.signEvent = queuedSignEvent;

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
