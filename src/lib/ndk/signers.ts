import {
  NDKNip07Signer,
  NDKPrivateKeySigner,
  type NDKSigner,
} from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

export interface SignerCapabilities {
  hasExtension: boolean;
  hasNip04: boolean;
  hasNip44: boolean;
  hasGetRelays: boolean;
}

export function hasNIP07Extension(): boolean {
  return typeof window !== "undefined" && !!window.nostr;
}

export function isInAppWebView(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as typeof window & { flutter_inappwebview?: unknown };
  if (w.flutter_inappwebview) return true;
  if (typeof navigator === "undefined") return false;
  return /keychat/i.test(navigator.userAgent);
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return promise;
  }

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
  });
}

type SignerWithTimeoutFlag = NDKSigner & { __ghostrTimeoutWrapped?: boolean };

export function applySignerTimeouts(
  signer: NDKSigner,
  options: {
    enabled?: boolean;
    timeoutMs?: number;
    labelPrefix?: string;
  } = {},
): NDKSigner {
  const enabled = options.enabled ?? isInAppWebView();
  if (!enabled) return signer;

  const wrapped = signer as SignerWithTimeoutFlag;
  if (wrapped.__ghostrTimeoutWrapped) return signer;
  wrapped.__ghostrTimeoutWrapped = true;

  const timeoutMs = options.timeoutMs ?? 15000;
  const labelPrefix = options.labelPrefix ?? "NIP-07";

  if (typeof signer.sign === "function") {
    const originalSign = signer.sign.bind(signer);
    signer.sign = ((event) =>
      withTimeout(
        originalSign(event),
        timeoutMs,
        `${labelPrefix} signEvent`,
      )) as NDKSigner["sign"];
  }

  if (typeof signer.encrypt === "function") {
    const originalEncrypt = signer.encrypt.bind(signer);
    signer.encrypt = ((recipient, value, nip) =>
      withTimeout(
        originalEncrypt(recipient, value, nip),
        timeoutMs,
        `${labelPrefix} encrypt`,
      )) as NDKSigner["encrypt"];
  }

  if (typeof signer.decrypt === "function") {
    const originalDecrypt = signer.decrypt.bind(signer);
    signer.decrypt = ((sender, value, nip) =>
      withTimeout(
        originalDecrypt(sender, value, nip),
        timeoutMs,
        `${labelPrefix} decrypt`,
      )) as NDKSigner["decrypt"];
  }

  return signer;
}

/**
 * Check what capabilities the NIP-07 extension supports
 */
export function getSignerCapabilities(): SignerCapabilities {
  if (typeof window === "undefined" || !window.nostr) {
    return {
      hasExtension: false,
      hasNip04: false,
      hasNip44: false,
      hasGetRelays: false,
    };
  }

  const nostr = window.nostr;
  return {
    hasExtension: true,
    hasNip04: !!(nostr.nip04?.encrypt && nostr.nip04?.decrypt),
    hasNip44: !!(nostr.nip44?.encrypt && nostr.nip44?.decrypt),
    hasGetRelays: !!nostr.getRelays,
  };
}

/**
 * Wait for window.nostr to be available (mobile signers inject late)
 */
async function waitForNostrExtension(
  timeoutMs: number = 5000,
): Promise<boolean> {
  if (hasNIP07Extension()) return true;

  const pollInterval = 200;
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    if (hasNIP07Extension()) return true;
  }

  return false;
}

export async function createNIP07Signer(
  waitForExtension: boolean = false,
): Promise<NDKNip07Signer> {
  // Optionally wait for mobile signers to inject window.nostr
  if (waitForExtension) {
    const extensionAvailable = await waitForNostrExtension(5000);
    if (!extensionAvailable) {
      throw new Error(
        "No NIP-07 extension detected. Please install Alby or nos2x.",
      );
    }
  } else if (!hasNIP07Extension()) {
    throw new Error(
      "No NIP-07 extension detected. Please install Alby or nos2x.",
    );
  }

  const signer = new NDKNip07Signer();
  await signer.blockUntilReady();
  return signer;
}

export function createNSECSigner(nsec: string): NDKPrivateKeySigner {
  let privateKey: Uint8Array;

  if (nsec.startsWith("nsec")) {
    const decoded = nip19.decode(nsec);
    if (decoded.type !== "nsec") {
      throw new Error("Invalid nsec format");
    }
    privateKey = decoded.data;
  } else {
    // Assume hex format
    privateKey = hexToBytes(nsec);
  }

  return new NDKPrivateKeySigner(privateKey);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
