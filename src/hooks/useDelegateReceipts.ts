import { useEffect, useRef } from "react";
import type { NDKEvent, NDKSubscription } from "@nostr-dev-kit/ndk";
import { useNDKStore } from "@/stores/ndkStore";
import { useAuthStore } from "@/stores/authStore";
import { useDraftStore } from "@/stores/draftStore";
import { unwrapGiftWrappedMessage } from "@/lib/nostr/nip59";
import type { ReceiptPayload } from "@/types/receipt";
import { toast } from "@/hooks/useToast";

const GIFT_WRAP_KIND = 1059;

// Track processed event IDs to prevent duplicate processing across re-mounts
const processedEventIds = new Set<string>();

// Queue of pending receipts to retry when drafts load
interface PendingReceipt {
  submissionId: string;
  action: "approved" | "rejected";
  eventId?: string;
  feedback?: string;
}
const pendingReceipts: PendingReceipt[] = [];

export function useDelegateReceipts() {
  const { ndk } = useNDKStore();
  const { user, isAuthenticated } = useAuthStore();
  const { markAsPublished, markAsRejected, saveDraft, drafts, isSyncing } =
    useDraftStore();
  const subscriptionRef = useRef<NDKSubscription | null>(null);
  // Use ref to access current drafts in event handler without re-subscribing
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // Process a receipt against current drafts
  const processReceipt = async (receipt: PendingReceipt) => {
    const currentDrafts = draftsRef.current;
    const draft = currentDrafts.find(
      (d) => d.lastSubmissionId === receipt.submissionId,
    );

    if (!draft) {
      return false; // Not found, may need retry
    }

    console.log(
      "[DelegateReceipts] Found matching draft:",
      draft.id,
      "current status:",
      draft.status,
    );

    // Skip if already in final state
    if (draft.status === "published" && draft.publishedEventId) {
      return true; // Already processed
    }
    if (draft.status === "rejected" && receipt.action === "rejected") {
      return true; // Already processed
    }

    if (receipt.action === "approved" && receipt.eventId) {
      markAsPublished(draft.id, receipt.eventId);
      await saveDraft(draft.id);

      toast({
        title: "Content Published!",
        description:
          "Your submission has been approved and published by the admin.",
      });
    } else if (receipt.action === "rejected") {
      markAsRejected(draft.id, receipt.feedback);
      await saveDraft(draft.id);

      toast({
        title: "Submission Rejected",
        description:
          receipt.feedback ||
          "Your submission has been rejected by the publisher.",
        variant: "destructive",
      });
    }

    return true;
  };

  // Process pending receipts when drafts change
  useEffect(() => {
    if (isSyncing || drafts.length === 0 || pendingReceipts.length === 0) {
      return;
    }

    // Try to process pending receipts
    const stillPending: PendingReceipt[] = [];
    for (const receipt of pendingReceipts) {
      const currentDrafts = draftsRef.current;
      const draft = currentDrafts.find(
        (d) => d.lastSubmissionId === receipt.submissionId,
      );
      if (!draft) {
        stillPending.push(receipt);
      } else {
        processReceipt(receipt);
      }
    }

    // Update pending list
    pendingReceipts.length = 0;
    pendingReceipts.push(...stillPending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, isSyncing]);

  useEffect(() => {
    if (!ndk || !user || !isAuthenticated) {
      return;
    }

    const subscribe = async () => {
      // Clean up existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
      }

      const filter = {
        kinds: [GIFT_WRAP_KIND],
        "#p": [user.pubkey],
        // Get receipts from the last 30 days
        since: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
      };

      const sub = ndk.subscribe(filter, { closeOnEose: false });
      subscriptionRef.current = sub;

      sub.on("event", async (event: NDKEvent) => {
        // Skip if already processed this event
        if (processedEventIds.has(event.id)) {
          return;
        }
        processedEventIds.add(event.id);

        try {
          console.log(
            "[DelegateReceipts] Received gift-wrapped event:",
            event.id,
          );

          // Wrap unwrap in a timeout to prevent blocking on slow signers
          const unwrapPromise = unwrapGiftWrappedMessage(event);
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10000),
          );
          const unwrapped = await Promise.race([unwrapPromise, timeoutPromise]);

          if (!unwrapped) {
            console.log("[DelegateReceipts] Failed to unwrap message");
            return;
          }

          // Check if it's a receipt
          if (unwrapped.payload.type !== "receipt") {
            return;
          }

          const receipt = unwrapped.payload as ReceiptPayload;
          console.log(
            "[DelegateReceipts] Receipt:",
            receipt.action,
            "submissionId:",
            receipt.submissionId,
          );

          const pendingReceipt: PendingReceipt = {
            submissionId: receipt.submissionId,
            action: receipt.action,
            eventId: receipt.eventId,
            feedback: receipt.feedback,
          };

          // Try to process immediately
          const processed = await processReceipt(pendingReceipt);
          if (!processed) {
            // Queue for later if drafts aren't loaded yet
            console.log(
              "[DelegateReceipts] Queueing receipt for later:",
              receipt.submissionId,
            );
            pendingReceipts.push(pendingReceipt);
          }
        } catch (error) {
          console.error("Failed to process receipt:", error);
        }
      });
    };

    subscribe();

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
        subscriptionRef.current = null;
      }
    };
    // Remove drafts from dependencies - we use ref to avoid re-subscribing
  }, [ndk, user, isAuthenticated, markAsPublished, markAsRejected, saveDraft]);
}
