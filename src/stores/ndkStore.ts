import { create } from "zustand";
import NDK, { NDKKind } from "@nostr-dev-kit/ndk";
import { initializeNDK, resetNDK } from "@/lib/ndk/instance";
import { getStoredRelays, saveRelays } from "@/lib/ndk/relays";
import { useSettingsStore } from "./settingsStore";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface RelayConfig {
  url: string;
  read: boolean;
  write: boolean;
}

interface NDKStore {
  ndk: NDK | null;
  connectionStatus: ConnectionStatus;
  connectedRelays: string[];
  error: string | null;

  initialize: () => Promise<void>;
  disconnect: () => void;
  addRelay: (url: string) => void;
  removeRelay: (url: string) => void;
  fetchNIP65Relays: (pubkey: string) => Promise<RelayConfig[]>;
  connectToRelays: (relayUrls: string[]) => Promise<void>;
}

export const useNDKStore = create<NDKStore>((set, get) => ({
  ndk: null,
  connectionStatus: "disconnected",
  connectedRelays: [],
  error: null,

  initialize: async () => {
    if (get().connectionStatus === "connecting") return;

    set({ connectionStatus: "connecting", error: null });

    try {
      const ndk = await initializeNDK();

      // Track connected relays - check actual WebSocket state
      const connectedRelays: string[] = [];
      for (const [url, relay] of ndk.pool.relays) {
        // relay.connectivity.status or check if relay is connected
        try {
          if (relay.connectivity?.isAvailable?.()) {
            connectedRelays.push(url);
          }
        } catch {
          // Fallback: assume connected if in pool
          connectedRelays.push(url);
        }
      }

      // Even if no relays connected yet, we can proceed
      // The pool will keep trying to connect
      set({
        ndk,
        connectionStatus:
          connectedRelays.length > 0 ? "connected" : "connected",
        connectedRelays,
      });

      // Update connected relays as they come online
      ndk.pool.on("relay:connect", (relay) => {
        set((state) => {
          const url = relay.url;
          if (!state.connectedRelays.includes(url)) {
            return { connectedRelays: [...state.connectedRelays, url] };
          }
          return state;
        });
      });

      ndk.pool.on("relay:disconnect", (relay) => {
        set((state) => ({
          connectedRelays: state.connectedRelays.filter((r) => r !== relay.url),
        }));
      });
    } catch (error) {
      set({
        connectionStatus: "error",
        error: error instanceof Error ? error.message : "Failed to connect",
      });
    }
  },

  disconnect: () => {
    resetNDK();
    set({
      ndk: null,
      connectionStatus: "disconnected",
      connectedRelays: [],
    });
  },

  addRelay: (url: string) => {
    const { ndk } = get();
    if (!ndk) return;

    ndk.addExplicitRelay(url);

    const relays = getStoredRelays();
    if (!relays.includes(url)) {
      relays.push(url);
      saveRelays(relays);
    }

    set((state) => ({
      connectedRelays: [...state.connectedRelays, url],
    }));
  },

  removeRelay: (url: string) => {
    const { ndk } = get();
    if (!ndk) return;

    const relay = ndk.pool.relays.get(url);
    if (relay) {
      relay.disconnect();
      ndk.pool.relays.delete(url);
    }

    const relays = getStoredRelays().filter((r) => r !== url);
    saveRelays(relays);

    set((state) => ({
      connectedRelays: state.connectedRelays.filter((r) => r !== url),
    }));
  },

  fetchNIP65Relays: async (pubkey: string): Promise<RelayConfig[]> => {
    const { ndk } = get();
    if (!ndk) return [];

    try {
      // Fetch kind 10002 (NIP-65 relay list) event with timeout
      const fetchPromise = ndk.fetchEvents({
        kinds: [NDKKind.RelayList],
        authors: [pubkey],
        limit: 1,
      });
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), 10000),
      );
      const events = await Promise.race([fetchPromise, timeoutPromise]);
      if (!events) {
        console.warn("[NDK] NIP-65 relay fetch timed out after 10s");
        return [];
      }

      const relayListEvent = Array.from(events)[0];
      if (!relayListEvent) return [];

      const relayConfigs: RelayConfig[] = [];

      // Parse relay tags from the event
      // Format: ["r", "wss://relay.example.com", "read"] or ["r", "wss://relay.example.com", "write"] or just ["r", "wss://relay.example.com"]
      for (const tag of relayListEvent.tags) {
        if (tag[0] === "r" && tag[1]) {
          const url = tag[1];
          const marker = tag[2]; // "read", "write", or undefined (both)

          const existing = relayConfigs.find((r) => r.url === url);
          if (existing) {
            if (!marker || marker === "read") existing.read = true;
            if (!marker || marker === "write") existing.write = true;
          } else {
            relayConfigs.push({
              url,
              read: !marker || marker === "read",
              write: !marker || marker === "write",
            });
          }
        }
      }

      // Store in settings
      useSettingsStore.getState().setNIP65Relays(relayConfigs);

      // Connect to NIP-65 relays if enabled
      const { useNIP65 } = useSettingsStore.getState();
      if (useNIP65 && relayConfigs.length > 0) {
        for (const relay of relayConfigs) {
          // Add relay if not already in pool
          if (!ndk.pool.relays.has(relay.url)) {
            ndk.addExplicitRelay(relay.url);
          }
        }
      }

      return relayConfigs;
    } catch (err) {
      console.error("Failed to fetch NIP-65 relays:", err);
      return [];
    }
  },

  connectToRelays: async (relayUrls: string[]) => {
    const { ndk } = get();
    if (!ndk) return;

    for (const url of relayUrls) {
      if (!ndk.pool.relays.has(url)) {
        ndk.addExplicitRelay(url);
      }
    }
  },
}));
