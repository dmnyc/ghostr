import { create } from "zustand";
import type { NDKSigner, NDKUser } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { useNDKStore } from "./ndkStore";
import { useDraftStore } from "./draftStore";
import { useSubmissionStore } from "./submissionStore";
import {
  applySignerTimeouts,
  createNIP07Signer,
  createNIP46BunkerSigner,
  createNSECSigner,
  createWindowNostrSigner,
  isInAppWebView,
  withTimeout,
} from "@/lib/ndk/signers";

type SignerType = "nip07" | "nsec" | "nip46" | null;

interface UserProfile {
  name?: string;
  picture?: string;
  nip05?: string;
  about?: string;
}

interface AuthStore {
  isAuthenticated: boolean;
  user: NDKUser | null;
  signer: NDKSigner | null;
  signerType: SignerType;
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;

  loginWithNIP07: () => Promise<void>;
  loginWithNSEC: (nsec: string) => Promise<void>;
  loginWithBunker: (bunkerUri: string) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  isAuthenticated: false,
  user: null,
  signer: null,
  signerType: null,
  profile: null,
  isLoading: false,
  error: null,

  loginWithNIP07: async () => {
    if (get().isLoading) {
      console.log("[Auth] loginWithNIP07 skipped - already loading");
      return;
    }
    set({ isLoading: true, error: null });

    try {
      const inApp = isInAppWebView();
      const timeoutMs = inApp ? 15000 : 0;
      console.log(
        "[Auth] Creating NIP-07 signer... inApp:",
        inApp,
        "timeoutMs:",
        timeoutMs,
      );
      console.log("[Auth] window.nostr available:", !!window.nostr);
      console.log(
        "[Auth] window.nostr.nip44 available:",
        !!window.nostr?.nip44,
      );
      // Wait for extension when user explicitly clicks login (mobile signers inject late)
      const signer = inApp
        ? await createWindowNostrSigner(timeoutMs || 10000)
        : await withTimeout(createNIP07Signer(true), timeoutMs, "NIP-07 init");
      console.log("[Auth] Signer created successfully");
      const wrappedSigner = applySignerTimeouts(signer, {
        enabled: inApp,
        timeoutMs,
        labelPrefix: "NIP-07",
      });
      console.log("[Auth] Signer ready, getting user...");
      const user = await withTimeout(
        wrappedSigner.user(),
        timeoutMs,
        "NIP-07 getPublicKey",
      );
      console.log("[Auth] User pubkey:", user.pubkey.slice(0, 8) + "...");

      const { ndk } = useNDKStore.getState();
      if (ndk) {
        ndk.signer = wrappedSigner;
      }

      set({
        isAuthenticated: true,
        user,
        signer: wrappedSigner,
        signerType: "nip07",
        isLoading: false,
      });

      // Save session type
      localStorage.setItem("ghostr-auth-type", "nip07");

      // Fetch profile and NIP-65 relays in background (don't block login)
      get()
        .fetchProfile()
        .catch(() => {});
      useNDKStore
        .getState()
        .fetchNIP65Relays(user.pubkey)
        .catch(() => {});
    } catch (error) {
      const baseMessage =
        error instanceof Error ? error.message : "Failed to login with NIP-07";
      const message =
        isInAppWebView() && baseMessage.includes("timed out")
          ? `${baseMessage}. If this is Keychat's in-app browser, try again or use NSEC login.`
          : baseMessage;
      set({
        isLoading: false,
        error: message,
      });
    }
  },

  loginWithNSEC: async (nsec: string) => {
    if (get().isLoading) {
      return;
    }
    set({ isLoading: true, error: null });

    try {
      const signer = createNSECSigner(nsec);
      const user = await signer.user();

      const { ndk } = useNDKStore.getState();
      if (ndk) {
        ndk.signer = signer;
      }

      set({
        isAuthenticated: true,
        user,
        signer,
        signerType: "nsec",
        isLoading: false,
      });

      // Fetch profile and NIP-65 relays in background (don't block login)
      get()
        .fetchProfile()
        .catch(() => {});
      useNDKStore
        .getState()
        .fetchNIP65Relays(user.pubkey)
        .catch(() => {});
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Invalid nsec",
      });
    }
  },

  loginWithBunker: async (bunkerUri: string) => {
    if (get().isLoading) {
      console.log("[Auth] loginWithBunker skipped - already loading");
      return;
    }
    set({ isLoading: true, error: null });

    try {
      const { ndk } = useNDKStore.getState();
      if (!ndk) {
        throw new Error("NDK not initialized. Please try again.");
      }

      const savedLocalKey =
        localStorage.getItem("ghostr-nip46-local-key") || undefined;

      const { signer, localKeyHex } = await createNIP46BunkerSigner(
        ndk,
        bunkerUri,
        savedLocalKey,
      );

      const user = await signer.user();
      console.log("[Auth] NIP-46 user pubkey:", user.pubkey.slice(0, 8) + "...");

      ndk.signer = signer;

      set({
        isAuthenticated: true,
        user,
        signer,
        signerType: "nip46",
        isLoading: false,
      });

      localStorage.setItem("ghostr-auth-type", "nip46");
      localStorage.setItem("ghostr-nip46-bunker-uri", bunkerUri);
      localStorage.setItem("ghostr-nip46-local-key", localKeyHex);

      get()
        .fetchProfile()
        .catch(() => {});
      useNDKStore
        .getState()
        .fetchNIP65Relays(user.pubkey)
        .catch(() => {});
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to connect to bunker";
      set({
        isLoading: false,
        error: message.includes("timed out")
          ? "Bunker connection timed out. Make sure your bunker is online and you approved the request."
          : `Bunker connection failed: ${message}`,
      });
    }
  },

  logout: () => {
    const { ndk } = useNDKStore.getState();
    if (ndk) {
      ndk.signer = undefined;
    }

    // Clear saved session and role
    localStorage.removeItem("ghostr-auth-type");
    localStorage.removeItem("ghostr-nip46-bunker-uri");
    localStorage.removeItem("ghostr-nip46-local-key");
    sessionStorage.removeItem("ghostr-active-role");

    // Clear user-specific stores
    useDraftStore.getState().clearDrafts();
    useSubmissionStore.getState().setSubmissions([]);

    set({
      isAuthenticated: false,
      user: null,
      signer: null,
      signerType: null,
      profile: null,
      error: null,
    });
  },

  restoreSession: async () => {
    const savedAuthType = localStorage.getItem("ghostr-auth-type");

    if (!savedAuthType) {
      return;
    }

    if (savedAuthType === "nip07") {
      console.log("[Auth] Attempting to restore NIP-07 session...");
      try {
        await get().loginWithNIP07();
        console.log("[Auth] Session restored successfully");
      } catch (error) {
        console.warn(
          "[Auth] Failed to restore session:",
          error instanceof Error ? error.message : error,
        );
        localStorage.removeItem("ghostr-auth-type");
      }
    } else if (savedAuthType === "nip46") {
      const bunkerUri = localStorage.getItem("ghostr-nip46-bunker-uri");
      if (!bunkerUri) {
        localStorage.removeItem("ghostr-auth-type");
        return;
      }
      console.log("[Auth] Attempting to restore NIP-46 session...");
      try {
        await get().loginWithBunker(bunkerUri);
        console.log("[Auth] NIP-46 session restored successfully");
      } catch (error) {
        console.warn(
          "[Auth] Failed to restore NIP-46 session:",
          error instanceof Error ? error.message : error,
        );
        localStorage.removeItem("ghostr-auth-type");
        localStorage.removeItem("ghostr-nip46-bunker-uri");
        localStorage.removeItem("ghostr-nip46-local-key");
      }
    }
  },

  fetchProfile: async () => {
    const { user } = get();
    const { ndk } = useNDKStore.getState();

    if (!user || !ndk) return;

    try {
      // Get user through NDK so it can fetch from relays
      const ndkUser = ndk.getUser({ pubkey: user.pubkey });
      await ndkUser.fetchProfile();

      if (ndkUser.profile) {
        set({
          profile: {
            name: ndkUser.profile.name || ndkUser.profile.displayName,
            picture: ndkUser.profile.picture || ndkUser.profile.image,
            nip05: ndkUser.profile.nip05,
            about: ndkUser.profile.about,
          },
        });
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    }
  },
}));

// Helper to get npub from pubkey
export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

// Helper to get pubkey from npub
export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== "npub") {
    throw new Error("Invalid npub");
  }
  return decoded.data;
}
