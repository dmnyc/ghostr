import NDK, { NDKEvent } from "@nostr-dev-kit/ndk";
import type { Draft } from "@/types/draft";
import type { PublisherDraft } from "@/types/publisherDraft";
import { NIP37_DRAFT_KIND, DRAFT_KIND, DRAFT_D_TAG } from "@/lib/constants";
import { isInAppWebView, withTimeout } from "@/lib/ndk/signers";
import { useNDKStore } from "@/stores/ndkStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * NIP-37: Draft storage using kind 31234 events
 *
 * Each draft is stored as a separate parameterized replaceable event:
 * - kind: 31234
 * - d tag: unique draft ID
 * - k tag: target event kind (1 or 30023)
 * - content: NIP-44 encrypted JSON of draft data
 *
 * Deletion is signaled by publishing with empty content.
 */

// Data stored in encrypted content (excludes 'id' which is in the d-tag)
interface DraftPayload {
  title: string;
  summary?: string;
  content: string;
  targetKind: 1 | 30023;
  tags: string[][];
  status: "draft" | "submitted" | "published" | "rejected";
  updatedAt: number;
  targetPublisher?: Draft["targetPublisher"];
  submittedTo?: string;
  lastSubmissionId?: string;
  publishedEventId?: string;
  rejectionReason?: string;
  coverImage?: string;
  archived?: boolean;
  uploadedImages?: string[];
}

function draftToPayload(draft: Draft): DraftPayload {
  return {
    title: draft.title,
    summary: draft.summary,
    content: draft.content,
    targetKind: draft.targetKind,
    tags: draft.tags,
    status: draft.status,
    updatedAt: draft.updatedAt,
    targetPublisher: draft.targetPublisher,
    submittedTo: draft.submittedTo,
    lastSubmissionId: draft.lastSubmissionId,
    publishedEventId: draft.publishedEventId,
    rejectionReason: draft.rejectionReason,
    coverImage: draft.coverImage,
    archived: draft.archived,
    uploadedImages: draft.uploadedImages,
  };
}

function payloadToDraft(id: string, payload: DraftPayload): Draft {
  return {
    id,
    title: payload.title,
    summary: payload.summary,
    content: payload.content,
    targetKind: payload.targetKind,
    tags: payload.tags,
    status: payload.status,
    updatedAt: payload.updatedAt,
    targetPublisher: payload.targetPublisher,
    submittedTo: payload.submittedTo,
    lastSubmissionId: payload.lastSubmissionId,
    publishedEventId: payload.publishedEventId,
    rejectionReason: payload.rejectionReason,
    coverImage: payload.coverImage,
    archived: payload.archived,
    uploadedImages: payload.uploadedImages,
  };
}

const PUBLISH_TIMEOUT_MS = 12000;

async function publishWithTimeout(
  event: NDKEvent,
  label: string,
): Promise<void> {
  const timeoutMs = isInAppWebView() ? PUBLISH_TIMEOUT_MS : 0;
  await withTimeout(event.publish(), timeoutMs, label);
}

/**
 * Wait for at least one relay to be connected
 */
async function waitForRelayConnection(
  ndk: NDK,
  timeoutMs: number = 2000,
): Promise<boolean> {
  const startTime = Date.now();

  // Check immediately first
  for (const relay of ndk.pool.relays.values()) {
    try {
      if (relay.connectivity?.isAvailable?.()) {
        return true;
      }
    } catch {
      // Try next relay
    }
  }

  // Poll with shorter interval
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (const relay of ndk.pool.relays.values()) {
      try {
        if (relay.connectivity?.isAvailable?.()) {
          return true;
        }
      } catch {
        // Try next relay
      }
    }
  }

  // Even if no relay reports connected, we might still be able to fetch
  // (the pool manages connections internally)
  return ndk.pool.relays.size > 0;
}

/**
 * Result of loading drafts from relay
 */
export interface LoadDraftsResult {
  drafts: Draft[];
  deletedIds: Set<string>; // IDs of drafts that have been deleted (empty content events)
}

export interface LoadPublisherDraftsResult {
  drafts: PublisherDraft[];
  deletedIds: Set<string>; // IDs of drafts that have been deleted (empty content events)
}

/**
 * Load all drafts from relay using NIP-37 format
 */
export async function loadDraftsNIP37(): Promise<LoadDraftsResult> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  // Wait for at least one relay to be ready
  console.log("[NIP-37] Waiting for relay connection...");
  await waitForRelayConnection(ndk);

  // Fetch all NIP-37 drafts by this user (can't filter by #client - relays don't support it well)
  const filter = {
    kinds: [NIP37_DRAFT_KIND],
    authors: [user.pubkey],
  };

  console.log("[NIP-37] Fetching events with filter:", filter);

  // Add timeout to prevent hanging (8 seconds - we have cached data as fallback)
  const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) =>
    setTimeout(() => reject(new Error("Fetch timeout")), 8000),
  );

  let events: Set<NDKEvent>;
  try {
    events = await Promise.race([
      ndk.fetchEvents(filter, { closeOnEose: true }),
      timeoutPromise,
    ]);
  } catch (error) {
    console.warn("[NIP-37] fetchEvents failed or timed out:", error);
    events = new Set();
  }

  console.log("[NIP-37] fetchEvents returned", events.size, "events");
  const drafts: Draft[] = [];
  const deletedIds = new Set<string>();

  for (const event of events) {
    // Only process Ghostr drafts (check for client tag)
    const clientTag = event.tags.find((t) => t[0] === "client");
    if (!clientTag || clientTag[1] !== "ghostr") continue;

    // Get draft ID from d-tag
    const dTag = event.tags.find((t) => t[0] === "d");
    if (!dTag || !dTag[1]) continue;

    const draftId = dTag[1];

    // Track deleted drafts (empty content = deletion marker)
    if (!event.content) {
      console.log("[NIP-37] Found deletion marker for draft:", draftId);
      deletedIds.add(draftId);
      continue;
    }

    try {
      // Decrypt content (NIP-44 encrypted to self)
      const decrypted = await signer.decrypt(user, event.content, "nip44");
      const payload = JSON.parse(decrypted) as DraftPayload;
      drafts.push(payloadToDraft(draftId, payload));
    } catch {
      // Skip drafts that fail to decrypt (may be from other clients)
    }
  }

  // Sort by updatedAt descending (newest first)
  drafts.sort((a, b) => b.updatedAt - a.updatedAt);

  return { drafts, deletedIds };
}

/**
 * Save a single draft to relay using NIP-37 format
 */
export async function saveDraftNIP37(draft: Draft): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  const payload = draftToPayload(draft);
  const content = JSON.stringify(payload);

  // Encrypt to self using NIP-44
  const encrypted = await signer.encrypt(user, content, "nip44");

  const event = new NDKEvent(ndk);
  event.kind = NIP37_DRAFT_KIND;
  event.content = encrypted;
  event.tags = [
    ["d", draft.id],
    ["k", String(draft.targetKind)],
    ["client", "ghostr"],
  ];

  await publishWithTimeout(event, "NIP-37 publish draft");
}

/**
 * Delete a draft from relay by publishing with empty content
 */
export async function deleteDraftNIP37(
  draftId: string,
  targetKind: 1 | 30023 = 1,
): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  // Publish event with empty content to signal deletion
  const event = new NDKEvent(ndk);
  event.kind = NIP37_DRAFT_KIND;
  event.content = "";
  event.tags = [
    ["d", draftId],
    ["k", String(targetKind)],
    ["client", "ghostr"],
  ];

  await publishWithTimeout(event, "NIP-37 delete draft");
}

/**
 * Load legacy drafts from NIP-78 format (for migration)
 */
export async function loadLegacyDrafts(): Promise<Draft[]> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  const filter = {
    kinds: [DRAFT_KIND],
    authors: [user.pubkey],
    "#d": [DRAFT_D_TAG],
  };

  const event = await ndk.fetchEvent(filter);

  if (!event) {
    return [];
  }

  try {
    const decrypted = await signer.decrypt(user, event.content);
    const drafts = JSON.parse(decrypted) as Draft[];
    return drafts;
  } catch {
    // Expected if legacy event exists but can't be decrypted (different app or corrupted)
    return [];
  }
}

/**
 * Delete the legacy NIP-78 drafts event after migration
 */
export async function deleteLegacyDraftsEvent(): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  // Publish event with empty content to "delete" the legacy drafts
  const event = new NDKEvent(ndk);
  event.kind = DRAFT_KIND;
  event.content = "";
  event.tags = [["d", DRAFT_D_TAG]];

  await publishWithTimeout(event, "NIP-78 delete legacy drafts");
}

/**
 * Load drafts with automatic migration from legacy format
 */
export async function loadDraftsWithMigration(): Promise<LoadDraftsResult> {
  console.log("[NIP-37] Loading drafts...");

  // First, try to load NIP-37 drafts
  const result = await loadDraftsNIP37();
  console.log(
    "[NIP-37] Found",
    result.drafts.length,
    "NIP-37 drafts,",
    result.deletedIds.size,
    "deleted",
  );

  // If we found NIP-37 drafts or deletion markers, we're already migrated
  if (result.drafts.length > 0 || result.deletedIds.size > 0) {
    return result;
  }

  if (isInAppWebView()) {
    console.log("[NIP-37] In-app browser detected, skipping legacy drafts");
    return result;
  }

  // No NIP-37 drafts found, check for legacy NIP-78 drafts
  const legacyDrafts = await loadLegacyDrafts();

  if (legacyDrafts.length > 0) {
    console.log(
      `Migrating ${legacyDrafts.length} drafts from NIP-78 to NIP-37...`,
    );

    // Migrate each draft to NIP-37 format
    for (const draft of legacyDrafts) {
      try {
        await saveDraftNIP37(draft);
      } catch (error) {
        console.error("Failed to migrate draft:", draft.id, error);
      }
    }

    // Delete the legacy NIP-78 event
    try {
      await deleteLegacyDraftsEvent();
      console.log("Legacy drafts event deleted");
    } catch (error) {
      console.error("Failed to delete legacy drafts event:", error);
    }

    return { drafts: legacyDrafts, deletedIds: new Set() };
  }

  // No drafts found anywhere
  return { drafts: [], deletedIds: new Set() };
}

/**
 * ============================================================================
 * Publisher Draft Functions (NIP-37)
 * ============================================================================
 */

// Data stored in encrypted content for publisher drafts (excludes 'id' which is in the d-tag)
interface PublisherDraftPayload {
  title: string;
  content: string;
  targetKind: 1 | 30023;
  tags: string[][];
  status: "draft" | "published";
  updatedAt: number;
  publishedEventId?: string;
  coverImage?: string;
  archived?: boolean;
  uploadedImages?: string[];
}

function publisherDraftToPayload(draft: PublisherDraft): PublisherDraftPayload {
  return {
    title: draft.title,
    content: draft.content,
    targetKind: draft.targetKind,
    tags: draft.tags,
    status: draft.status,
    updatedAt: draft.updatedAt,
    publishedEventId: draft.publishedEventId,
    coverImage: draft.coverImage,
    archived: draft.archived,
    uploadedImages: draft.uploadedImages,
  };
}

function payloadToPublisherDraft(
  id: string,
  payload: PublisherDraftPayload,
): PublisherDraft {
  return {
    id,
    title: payload.title,
    content: payload.content,
    targetKind: payload.targetKind,
    tags: payload.tags,
    status: payload.status,
    updatedAt: payload.updatedAt,
    publishedEventId: payload.publishedEventId,
    coverImage: payload.coverImage,
    archived: payload.archived,
    uploadedImages: payload.uploadedImages,
  };
}

/**
 * Load all publisher drafts from relay using NIP-37 format
 */
export async function loadPublisherDraftsNIP37(): Promise<LoadPublisherDraftsResult> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  // Wait for at least one relay to be ready
  console.log("[NIP-37 Publisher] Waiting for relay connection...");
  await waitForRelayConnection(ndk);

  // Fetch all NIP-37 publisher drafts by this user
  const filter = {
    kinds: [NIP37_DRAFT_KIND],
    authors: [user.pubkey],
  };

  console.log("[NIP-37 Publisher] Fetching events with filter:", filter);

  // Add timeout to prevent hanging (8 seconds - we have cached data as fallback)
  const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) =>
    setTimeout(() => reject(new Error("Fetch timeout")), 8000),
  );

  let events: Set<NDKEvent>;
  try {
    events = await Promise.race([
      ndk.fetchEvents(filter, { closeOnEose: true }),
      timeoutPromise,
    ]);
  } catch (error) {
    console.warn("[NIP-37 Publisher] fetchEvents failed or timed out:", error);
    events = new Set();
  }

  console.log("[NIP-37 Publisher] fetchEvents returned", events.size, "events");
  const drafts: PublisherDraft[] = [];
  const deletedIds = new Set<string>();

  for (const event of events) {
    // Only process Ghostr publisher drafts (check for client tag)
    const clientTag = event.tags.find((t) => t[0] === "client");
    if (!clientTag || clientTag[1] !== "ghostr-publisher") continue;

    // Get draft ID from d-tag
    const dTag = event.tags.find((t) => t[0] === "d");
    if (!dTag || !dTag[1]) continue;

    const draftId = dTag[1];

    // Track deleted drafts (empty content = deletion marker)
    if (!event.content) {
      console.log(
        "[NIP-37 Publisher] Found deletion marker for draft:",
        draftId,
      );
      deletedIds.add(draftId);
      continue;
    }

    try {
      // Decrypt content (NIP-44 encrypted to self)
      const decrypted = await signer.decrypt(user, event.content, "nip44");
      const payload = JSON.parse(decrypted) as PublisherDraftPayload;
      drafts.push(payloadToPublisherDraft(draftId, payload));
    } catch {
      // Skip drafts that fail to decrypt (may be from other clients)
    }
  }

  // Sort by updatedAt descending (newest first)
  drafts.sort((a, b) => b.updatedAt - a.updatedAt);

  return { drafts, deletedIds };
}

/**
 * Save a single publisher draft to relay using NIP-37 format
 */
export async function savePublisherDraftNIP37(
  draft: PublisherDraft,
): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  const payload = publisherDraftToPayload(draft);
  const content = JSON.stringify(payload);

  // Encrypt to self using NIP-44
  const encrypted = await signer.encrypt(user, content, "nip44");

  const event = new NDKEvent(ndk);
  event.kind = NIP37_DRAFT_KIND;
  event.content = encrypted;
  event.tags = [
    ["d", draft.id],
    ["k", String(draft.targetKind)],
    ["client", "ghostr-publisher"],
  ];

  await publishWithTimeout(event, "NIP-37 publish publisher draft");
}

/**
 * Delete a publisher draft from relay by publishing with empty content
 */
export async function deletePublisherDraftNIP37(
  draftId: string,
  targetKind: 1 | 30023 = 1,
): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  // Publish event with empty content to signal deletion
  const event = new NDKEvent(ndk);
  event.kind = NIP37_DRAFT_KIND;
  event.content = "";
  event.tags = [
    ["d", draftId],
    ["k", String(targetKind)],
    ["client", "ghostr-publisher"],
  ];

  await publishWithTimeout(event, "NIP-37 delete publisher draft");
}
