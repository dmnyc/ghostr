import { useEffect, useRef } from "react";
import type { NDKEvent, NDKSubscription } from "@nostr-dev-kit/ndk";
import { useNDKStore } from "@/stores/ndkStore";
import { useAuthStore } from "@/stores/authStore";
import { useSubmissionStore } from "@/stores/submissionStore";
import {
  unwrapGiftWrappedMessage,
  submissionFromPayload,
} from "@/lib/nostr/nip59";
import type { SubmissionPayload } from "@/types/submission";

const GIFT_WRAP_KIND = 1059;

export function useAdminInbox(idsReady: boolean = true) {
  const { ndk } = useNDKStore();
  const { user, isAuthenticated } = useAuthStore();
  const { addSubmission, isProcessed, setLoading, archivedIds } =
    useSubmissionStore();
  const subscriptionRef = useRef<NDKSubscription | null>(null);

  useEffect(() => {
    // Wait for archived/processed IDs to be loaded before subscribing
    if (!ndk || !user || !isAuthenticated || !idsReady) {
      return;
    }

    const subscribe = async () => {
      // Don't show loading spinner - processed IDs are already loaded from localStorage
      // The inbox will update in real-time as events arrive

      // Clean up existing subscription
      if (subscriptionRef.current) {
        subscriptionRef.current.stop();
      }

      const filter = {
        kinds: [GIFT_WRAP_KIND],
        "#p": [user.pubkey],
        // Get messages from the last 30 days
        since: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
      };

      const sub = ndk.subscribe(filter, { closeOnEose: false });
      subscriptionRef.current = sub;

      sub.on("event", async (event: NDKEvent) => {
        try {
          // Wrap unwrap in a timeout to prevent blocking on slow signers
          const unwrapPromise = unwrapGiftWrappedMessage(event);
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 10000),
          );
          const unwrapped = await Promise.race([unwrapPromise, timeoutPromise]);

          if (!unwrapped) {
            return;
          }

          // Check if it's a submission
          if (unwrapped.payload.type !== "submission") {
            return;
          }

          const payload = unwrapped.payload as SubmissionPayload;

          // Check if already processed or archived
          if (isProcessed(payload.id) || archivedIds.has(payload.id)) {
            return;
          }

          // Use submittedAt from payload if available (accurate), otherwise fall back to event timestamp (randomized)
          const timestamp =
            payload.submittedAt ||
            event.created_at ||
            Math.floor(Date.now() / 1000);

          const submission = submissionFromPayload(
            payload,
            unwrapped.senderPubkey,
            event.id,
            timestamp,
          );

          addSubmission(submission);
        } catch (error) {
          console.error("Failed to process gift wrap:", error);
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
  }, [
    ndk,
    user,
    isAuthenticated,
    idsReady,
    addSubmission,
    isProcessed,
    archivedIds,
    setLoading,
  ]);
}
