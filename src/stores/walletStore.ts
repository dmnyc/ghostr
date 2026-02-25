/**
 * Wallet Store - Zustand store for Spark wallet state
 * 
 * Manages wallet connection, balance, and seed phrase backup status.
 * Seed phrase is encrypted in localStorage (user must back it up).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  connectWallet,
  disconnectWallet,
  getBalanceSats,
  isConnected,
} from "@/lib/lightning/sparkWallet";

export type WalletStatus = "disconnected" | "connecting" | "connected" | "error";

interface WalletStore {
  // State
  status: WalletStatus;
  balanceSats: number;
  error: string | null;
  hasBackedUpSeed: boolean;
  
  // Encrypted seed stored locally (encrypted with user's nostr key)
  // In prototype, stored as plaintext — TODO: encrypt with NIP-44
  encryptedSeed: string | null;
  
  // Breez API key (user provides their own or uses app default)
  apiKey: string | null;

  // Actions
  setupWallet: (mnemonic: string, apiKey: string) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  setBackedUp: () => void;
  clearWallet: () => void;
  setApiKey: (key: string) => void;
}

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      status: "disconnected",
      balanceSats: 0,
      error: null,
      hasBackedUpSeed: false,
      encryptedSeed: null,
      apiKey: null,

      setupWallet: async (mnemonic: string, apiKey: string) => {
        set({ status: "connecting", error: null });
        try {
          await connectWallet(mnemonic, apiKey);
          const balance = await getBalanceSats();
          set({
            status: "connected",
            balanceSats: balance,
            encryptedSeed: mnemonic, // TODO: Encrypt with user's nostr key
            apiKey,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to connect wallet";
          set({ status: "error", error: message });
          throw err;
        }
      },

      connect: async () => {
        const { encryptedSeed, apiKey } = get();
        if (!encryptedSeed || !apiKey) {
          set({ status: "error", error: "No wallet configured" });
          return;
        }
        if (isConnected()) {
          set({ status: "connected" });
          return;
        }
        set({ status: "connecting", error: null });
        try {
          await connectWallet(encryptedSeed, apiKey);
          const balance = await getBalanceSats();
          set({ status: "connected", balanceSats: balance });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to connect";
          set({ status: "error", error: message });
        }
      },

      disconnect: async () => {
        await disconnectWallet();
        set({ status: "disconnected" });
      },

      refreshBalance: async () => {
        try {
          const balance = await getBalanceSats();
          set({ balanceSats: balance });
        } catch {
          console.warn("[WalletStore] Failed to refresh balance");
        }
      },

      setBackedUp: () => set({ hasBackedUpSeed: true }),

      clearWallet: () => {
        disconnectWallet().catch(() => {});
        set({
          status: "disconnected",
          balanceSats: 0,
          error: null,
          hasBackedUpSeed: false,
          encryptedSeed: null,
          apiKey: null,
        });
      },

      setApiKey: (key: string) => set({ apiKey: key }),
    }),
    {
      name: "ghostr-wallet",
      partialize: (state) => ({
        encryptedSeed: state.encryptedSeed,
        apiKey: state.apiKey,
        hasBackedUpSeed: state.hasBackedUpSeed,
      }),
    },
  ),
);
