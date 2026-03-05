import type NDK from "@nostr-dev-kit/ndk";
import {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  NDKRelay,
  NDKRelayAuthPolicies,
  NDKUser,
  type NDKEncryptionScheme,
  type NDKSigner,
  type NostrEvent,
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

class WindowNostrSigner implements NDKSigner {
  private readonly userValue: NDKUser;
  private readonly pubkeyValue: string;

  constructor(pubkey: string) {
    this.pubkeyValue = pubkey;
    this.userValue = new NDKUser({ pubkey });
  }

  get pubkey(): string {
    return this.pubkeyValue;
  }

  async blockUntilReady(): Promise<NDKUser> {
    return this.userValue;
  }

  async user(): Promise<NDKUser> {
    return this.userValue;
  }

  get userSync(): NDKUser {
    return this.userValue;
  }

  async sign(event: NostrEvent): Promise<string> {
    const signedEvent = await window.nostr?.signEvent?.(event);
    if (!signedEvent?.sig) {
      throw new Error("Failed to sign event");
    }
    return signedEvent.sig;
  }

  async relays(ndk?: NDK): Promise<NDKRelay[]> {
    if (!ndk) return [];
    const relays =
      (await window.nostr?.getRelays?.()) ??
      ({} as Record<string, { read?: boolean; write?: boolean }>);
    const activeRelays: string[] = [];
    for (const [url, perms] of Object.entries(relays)) {
      if (perms?.read && perms?.write) {
        activeRelays.push(url);
      }
    }
    return activeRelays.map(
      (url) => new NDKRelay(url, ndk.relayAuthDefaultPolicy, ndk),
    );
  }

  async encryptionEnabled(
    scheme?: NDKEncryptionScheme,
  ): Promise<NDKEncryptionScheme[]> {
    const enabled: NDKEncryptionScheme[] = [];
    if (
      (!scheme || scheme === "nip04") &&
      Boolean(window.nostr?.nip04?.encrypt && window.nostr?.nip04?.decrypt)
    ) {
      enabled.push("nip04");
    }
    if (
      (!scheme || scheme === "nip44") &&
      Boolean(window.nostr?.nip44?.encrypt && window.nostr?.nip44?.decrypt)
    ) {
      enabled.push("nip44");
    }
    return enabled;
  }

  async encrypt(
    recipient: NDKUser,
    value: string,
    scheme: NDKEncryptionScheme = "nip04",
  ): Promise<string> {
    const nostr = window.nostr;
    if (!nostr) {
      throw new Error("No NIP-07 extension detected");
    }
    if (scheme === "nip44") {
      if (!nostr.nip44?.encrypt) {
        throw new Error("nip44 encryption is not available");
      }
      return nostr.nip44.encrypt(recipient.pubkey, value);
    }
    if (!nostr.nip04?.encrypt) {
      throw new Error("nip04 encryption is not available");
    }
    return nostr.nip04.encrypt(recipient.pubkey, value);
  }

  async decrypt(
    sender: NDKUser,
    value: string,
    scheme: NDKEncryptionScheme = "nip04",
  ): Promise<string> {
    const nostr = window.nostr;
    if (!nostr) {
      throw new Error("No NIP-07 extension detected");
    }
    if (scheme === "nip44") {
      if (!nostr.nip44?.decrypt) {
        throw new Error("nip44 decryption is not available");
      }
      return nostr.nip44.decrypt(sender.pubkey, value);
    }
    if (!nostr.nip04?.decrypt) {
      throw new Error("nip04 decryption is not available");
    }
    return nostr.nip04.decrypt(sender.pubkey, value);
  }

  toPayload(): string {
    return JSON.stringify({ type: "nip07", payload: "" });
  }
}

export async function createWindowNostrSigner(
  timeoutMs: number = 10000,
): Promise<NDKSigner> {
  if (typeof window === "undefined" || !window.nostr) {
    throw new Error(
      "No NIP-07 extension detected. Please install Alby or nos2x.",
    );
  }
  const pubkey = await withTimeout(
    window.nostr.getPublicKey(),
    timeoutMs,
    "NIP-07 getPublicKey",
  );
  if (!pubkey) {
    throw new Error(
      "Signer returned empty pubkey. Please approve the connection request in your signer app.",
    );
  }
  return new WindowNostrSigner(pubkey);
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
  await signer.user();
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

/**
 * Create a NIP-46 bunker signer from a bunker:// URI.
 * Returns the ready signer and the local ephemeral key hex for persistence.
 */
export async function createNIP46BunkerSigner(
  ndk: NDK,
  bunkerUri: string,
  localSignerKey?: string,
  timeoutMs: number = 60000,
): Promise<{ signer: NDKNip46Signer; localKeyHex: string }> {
  if (!bunkerUri.startsWith("bunker://")) {
    throw new Error("Invalid bunker URI. Must start with bunker://");
  }

  const localSigner = localSignerKey
    ? new NDKPrivateKeySigner(hexToBytes(localSignerKey))
    : NDKPrivateKeySigner.generate();

  const nip46Signer = NDKNip46Signer.bunker(ndk, bunkerUri, localSigner);

  await withTimeout(
    nip46Signer.blockUntilReady(),
    timeoutMs,
    "NIP-46 bunker connection",
  );

  ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });

  const localKeyHex = nip46Signer.localSigner.privateKey!;

  return { signer: nip46Signer, localKeyHex };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
