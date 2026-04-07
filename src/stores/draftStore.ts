import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { Draft } from "@/types/draft";
import {
  loadDraftsWithMigration,
  saveDraftNIP37,
  deleteDraftNIP37,
} from "@/lib/nostr/nip37";
import { isInAppWebView, withTimeout } from "@/lib/ndk/signers";
import { sendGiftWrappedRetraction } from "@/lib/nostr/nip59";
import { npubToPubkey } from "@/stores/authStore";
import { PROTOCOL_VERSION } from "@/lib/constants";
import type { RetractionPayload } from "@/types/submission";

const DRAFTS_CACHE_KEY = "ghostr-drafts-cache";

// Track loading state outside of Zustand to prevent race conditions
let isLoadingInProgress = false;

// Load drafts from localStorage cache
function loadCachedDrafts(): Draft[] {
  try {
    const cached = localStorage.getItem(DRAFTS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as Draft[];
    }
  } catch {
    // Ignore cache errors
  }
  return [];
}

// Save drafts to localStorage cache
function saveDraftsToCache(drafts: Draft[]): void {
  try {
    localStorage.setItem(DRAFTS_CACHE_KEY, JSON.stringify(drafts));
  } catch {
    // Ignore cache errors (e.g., quota exceeded)
  }
}

// Clear the drafts cache
function clearDraftsCache(): void {
  try {
    localStorage.removeItem(DRAFTS_CACHE_KEY);
  } catch {
    // Ignore errors
  }
}

// Merge relay drafts with cached/local drafts (prefer newer version by updatedAt)
// Also protects status changes that happened locally (rejected, published) from being overwritten
// deletedIds contains IDs of drafts that were explicitly deleted on the relay
function mergeDrafts(
  local: Draft[],
  fromRelay: Draft[],
  deletedIds: Set<string> = new Set(),
): Draft[] {
  const relayMap = new Map(fromRelay.map((d) => [d.id, d]));
  const localMap = new Map(local.map((d) => [d.id, d]));
  const merged = new Map<string, Draft>();

  // Process all drafts from both sources
  const allIds = new Set([...relayMap.keys(), ...localMap.keys()]);

  for (const id of allIds) {
    // Skip drafts that have been explicitly deleted on the relay
    if (deletedIds.has(id)) {
      console.log("[mergeDrafts] Skipping deleted draft:", id);
      continue;
    }

    const relayDraft = relayMap.get(id);
    const localDraft = localMap.get(id);

    if (relayDraft && localDraft) {
      // Both exist - need to decide which to keep
      // Always prefer local if it has a "terminal" status change (rejected/published)
      // that the relay version doesn't have yet
      const localHasStatusChange =
        (localDraft.status === "rejected" ||
          localDraft.status === "published" ||
          localDraft.status === "retracted") &&
        (relayDraft.status === "submitted" || relayDraft.status === "draft");

      if (localHasStatusChange) {
        // Local has important status change, keep it regardless of timestamp
        console.log(
          "[mergeDrafts] Keeping local status change for draft:",
          id,
          localDraft.status,
        );
        merged.set(id, localDraft);
      } else if (localDraft.updatedAt >= relayDraft.updatedAt) {
        // Local is newer or equal
        merged.set(id, localDraft);
      } else {
        // Relay is newer
        console.log(
          "[mergeDrafts] Using relay version for draft:",
          id,
          "local:",
          localDraft.updatedAt,
          "relay:",
          relayDraft.updatedAt,
        );
        merged.set(id, relayDraft);
      }
    } else if (relayDraft) {
      // Only in relay
      merged.set(id, relayDraft);
    } else if (localDraft) {
      // Only local - keep if recent (less than 24 hours old)
      const ageMs = Date.now() - localDraft.updatedAt;
      if (ageMs < 24 * 60 * 60 * 1000) {
        merged.set(id, localDraft);
      }
    }
  }

  // Sort by updatedAt descending
  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

interface DraftStore {
  drafts: Draft[];
  currentDraftId: string | null;
  isLoading: boolean; // True only when no cached data and fetching
  isSyncing: boolean; // True when syncing from relays (cache may be shown)
  isSaving: boolean;
  lastSyncedAt: number | null;
  error: string | null;
  unseenRejectionIds: Set<string>; // Track IDs of rejections user hasn't dismissed

  loadDrafts: () => Promise<void>;
  saveDraft: (id: string) => Promise<void>;
  createDraft: () => Promise<Draft>;
  updateDraft: (id: string, updates: Partial<Draft>) => void;
  deleteDraft: (id: string) => Promise<void>;
  setCurrentDraft: (id: string | null) => void;
  getCurrentDraft: () => Draft | null;
  markAsSubmitted: (
    id: string,
    adminNpub: string,
    submissionId: string,
  ) => void;
  markAsPublished: (id: string, eventId: string) => void;
  markAsRejected: (id: string, reason?: string) => void;
  dismissRejection: (id: string) => void;
  dismissAllRejections: () => void;
  retractSubmission: (id: string) => Promise<void>;
  archiveDraft: (id: string) => Promise<void>;
  clearDrafts: () => void;
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  drafts: [],
  currentDraftId: null,
  isLoading: false,
  isSyncing: false,
  isSaving: false,
  lastSyncedAt: null,
  error: null,
  unseenRejectionIds: new Set<string>(),

  loadDrafts: async () => {
    // Use module-level flag to prevent race conditions (React Strict Mode, etc.)
    if (isLoadingInProgress) {
      console.log("[DraftStore] loadDrafts already in progress, skipping");
      return;
    }
    isLoadingInProgress = true;
    console.log("[DraftStore] loadDrafts starting...");

    const { drafts: existingDrafts } = get();

    // Step 1: Immediately load from cache (instant)
    // But merge with existing state to preserve any recent changes
    const cachedDrafts = loadCachedDrafts();
    const hasCachedDrafts = cachedDrafts.length > 0;
    const hasExistingDrafts = existingDrafts.length > 0;

    if (hasCachedDrafts) {
      console.log(
        "[DraftStore] Loaded",
        cachedDrafts.length,
        "drafts from cache",
      );
      // Sort cached drafts by updatedAt descending
      cachedDrafts.sort((a, b) => b.updatedAt - a.updatedAt);

      // If we already have drafts in state, merge to preserve recent changes
      if (hasExistingDrafts) {
        const mergedWithCache = mergeDrafts(existingDrafts, cachedDrafts);
        set({ drafts: mergedWithCache });
      } else {
        set({ drafts: cachedDrafts });
      }
    }

    // Step 2: Sync from relays in background
    // Only show loading spinner if no cached data AND no existing data
    console.log("[DraftStore] Syncing from relays...");
    set({
      isLoading: !hasCachedDrafts && !hasExistingDrafts,
      isSyncing: true,
      error: null,
    });

    // Retry logic - try up to 3 times with increasing delays
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const timeoutMs = isInAppWebView() ? 15000 : 0;
        const { drafts: relayDrafts, deletedIds } = await withTimeout(
          loadDraftsWithMigration(),
          timeoutMs,
          "Drafts load",
        );
        console.log(
          "[DraftStore] Loaded",
          relayDrafts.length,
          "drafts from relay on attempt",
          attempt,
          "with",
          deletedIds.size,
          "deletions",
        );

        // Merge with any locally-created drafts that haven't synced yet
        // Pass deletedIds to ensure deleted drafts are removed from local cache
        const currentDrafts = get().drafts;
        const mergedDrafts = mergeDrafts(
          currentDrafts,
          relayDrafts,
          deletedIds,
        );

        // Update store and cache
        set({
          drafts: mergedDrafts,
          isLoading: false,
          isSyncing: false,
          lastSyncedAt: Date.now(),
        });
        saveDraftsToCache(mergedDrafts);
        isLoadingInProgress = false;

        return; // Success - exit the function
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");
        console.warn(
          `[DraftStore] Attempt ${attempt}/${maxRetries} failed:`,
          error,
        );

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff: 1s, 2s)
          const delay = attempt * 1000;
          console.log(`[DraftStore] Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed - keep cached drafts if we have them
    console.error("[DraftStore] All retry attempts failed:", lastError);
    set({
      isLoading: false,
      isSyncing: false,
      error: hasCachedDrafts
        ? null
        : lastError?.message || "Failed to load drafts",
    });
    isLoadingInProgress = false;
  },

  saveDraft: async (id: string) => {
    const { drafts, isSaving } = get();
    if (isSaving) return;

    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;

    // Update local cache immediately
    saveDraftsToCache(drafts);

    set({ isSaving: true, error: null });

    try {
      await saveDraftNIP37(draft);
      set({
        isSaving: false,
        lastSyncedAt: Date.now(),
      });
    } catch (error) {
      set({
        isSaving: false,
        error: error instanceof Error ? error.message : "Failed to save draft",
      });
    }
  },

  createDraft: async () => {
    const newDraft: Draft = {
      id: uuidv4(),
      title: "",
      content: "",
      targetKind: 1,
      tags: [],
      status: "draft",
      updatedAt: Date.now(),
    };

    set((state) => {
      const newDrafts = [newDraft, ...state.drafts];
      saveDraftsToCache(newDrafts);
      return {
        drafts: newDrafts,
        currentDraftId: newDraft.id,
      };
    });

    // Immediately persist to relay
    try {
      await saveDraftNIP37(newDraft);
    } catch (error) {
      console.error("Failed to save new draft:", error);
    }

    return newDraft;
  },

  updateDraft: (id, updates) => {
    set((state) => {
      const newDrafts = state.drafts.map((draft) =>
        draft.id === id
          ? { ...draft, ...updates, updatedAt: Date.now() }
          : draft,
      );
      saveDraftsToCache(newDrafts);
      return { drafts: newDrafts };
    });
  },

  deleteDraft: async (id) => {
    const { drafts } = get();
    const draft = drafts.find((d) => d.id === id);

    set((state) => {
      const newDrafts = state.drafts.filter((draft) => draft.id !== id);
      saveDraftsToCache(newDrafts);
      return {
        drafts: newDrafts,
        currentDraftId:
          state.currentDraftId === id ? null : state.currentDraftId,
      };
    });

    // Delete from relay
    if (draft) {
      try {
        await deleteDraftNIP37(id, draft.targetKind);
      } catch (error) {
        console.error("Failed to delete draft from relay:", error);
      }
    }
  },

  setCurrentDraft: (id) => {
    set({ currentDraftId: id });
  },

  getCurrentDraft: () => {
    const { drafts, currentDraftId } = get();
    if (!currentDraftId) return null;
    return drafts.find((d) => d.id === currentDraftId) ?? null;
  },

  markAsSubmitted: (id, adminNpub, submissionId) => {
    set((state) => {
      const newDrafts = state.drafts.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              status: "submitted" as const,
              submittedTo: adminNpub,
              lastSubmissionId: submissionId,
              rejectionReason: undefined,
              updatedAt: Date.now(),
            }
          : draft,
      );
      // Remove from unseen rejections if resubmitting a rejected draft
      const newUnseenIds = new Set(state.unseenRejectionIds);
      newUnseenIds.delete(id);
      saveDraftsToCache(newDrafts);
      return { drafts: newDrafts, unseenRejectionIds: newUnseenIds };
    });
  },

  markAsPublished: (id, eventId) => {
    set((state) => {
      const newDrafts = state.drafts.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              status: "published" as const,
              publishedEventId: eventId,
              rejectionReason: undefined,
              updatedAt: Date.now(),
            }
          : draft,
      );
      saveDraftsToCache(newDrafts);
      return { drafts: newDrafts };
    });
  },

  markAsRejected: (id, reason) => {
    console.log(
      "[DraftStore] markAsRejected called for draft:",
      id,
      "reason:",
      reason,
    );
    set((state) => {
      const newDrafts = state.drafts.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              status: "rejected" as const,
              rejectionReason: reason,
              updatedAt: Date.now(),
            }
          : draft,
      );
      const newUnseenIds = new Set(state.unseenRejectionIds);
      newUnseenIds.add(id);
      saveDraftsToCache(newDrafts);
      return { drafts: newDrafts, unseenRejectionIds: newUnseenIds };
    });
  },

  dismissRejection: (id) => {
    set((state) => {
      const newUnseenIds = new Set(state.unseenRejectionIds);
      newUnseenIds.delete(id);
      return { unseenRejectionIds: newUnseenIds };
    });
  },

  dismissAllRejections: () => {
    set({ unseenRejectionIds: new Set() });
  },

  retractSubmission: async (id) => {
    const { drafts } = get();
    const draft = drafts.find((d) => d.id === id);
    if (!draft || draft.status !== "submitted" || !draft.submittedTo || !draft.lastSubmissionId) {
      throw new Error("Draft is not in a retractable state");
    }

    // Send retraction to the publisher
    const recipientPubkey = npubToPubkey(draft.submittedTo);
    const retraction: RetractionPayload = {
      protocol: PROTOCOL_VERSION as 'ghostr_v1',
      type: "retraction",
      submissionId: draft.lastSubmissionId,
      retractedAt: Math.floor(Date.now() / 1000),
    };

    await sendGiftWrappedRetraction(recipientPubkey, retraction);

    // Mark as retracted and auto-archive
    set((state) => {
      const newDrafts = state.drafts.map((d) =>
        d.id === id
          ? {
              ...d,
              status: "retracted" as const,
              archived: true,
              updatedAt: Date.now(),
            }
          : d,
      );
      saveDraftsToCache(newDrafts);
      return { drafts: newDrafts };
    });

    // Persist to relay
    const updatedDraft = get().drafts.find((d) => d.id === id);
    if (updatedDraft) {
      try {
        await saveDraftNIP37(updatedDraft);
      } catch (error) {
        console.error("[DraftStore] Failed to save retracted draft to relay:", error);
      }
    }
  },

  archiveDraft: async (id) => {
    const { drafts } = get();
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;

    // Update local state and cache immediately
    set((state) => {
      const newDrafts = state.drafts.map((d) =>
        d.id === id ? { ...d, archived: true, updatedAt: Date.now() } : d,
      );
      saveDraftsToCache(newDrafts);
      return { drafts: newDrafts };
    });

    // Persist to relay in background
    try {
      const updatedDraft = { ...draft, archived: true, updatedAt: Date.now() };
      await saveDraftNIP37(updatedDraft);
    } catch (error) {
      console.error(
        "[DraftStore] Failed to save archived status to relay:",
        error,
      );
    }
  },

  clearDrafts: () => {
    clearDraftsCache();
    set({
      drafts: [],
      currentDraftId: null,
      isLoading: false,
      isSyncing: false,
      isSaving: false,
      lastSyncedAt: null,
      error: null,
      unseenRejectionIds: new Set(),
    });
  },
}));
