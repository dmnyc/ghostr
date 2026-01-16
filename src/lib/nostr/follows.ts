import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { useNDKStore } from "@/stores/ndkStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * Fetch with timeout to prevent hanging on slow/blocked connections
 */
async function fetchWithTimeout<T>(
  fetchPromise: Promise<T>,
  timeoutMs: number = 10000,
): Promise<T | null> {
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs),
  );
  return Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Fetch the user's current follow list (kind 3)
 * Returns the set of pubkeys the user follows
 */
export async function fetchFollowList(): Promise<Set<string>> {
  const { ndk } = useNDKStore.getState();
  const { user } = useAuthStore.getState();

  if (!ndk || !user) {
    throw new Error("NDK or user not initialized");
  }

  try {
    const filter = {
      kinds: [NDKKind.Contacts],
      authors: [user.pubkey],
      limit: 1,
    };

    console.log("[Follows] Fetching follow list for:", user.pubkey.slice(0, 8));
    const events = await fetchWithTimeout(ndk.fetchEvents(filter), 10000);
    if (!events) {
      console.warn("[Follows] Fetch timed out after 10s");
      return new Set<string>();
    }
    console.log("[Follows] Found", events.size, "contact list events");

    const latestEvent = Array.from(events).sort(
      (a, b) => b.created_at! - a.created_at!,
    )[0];

    if (!latestEvent) {
      console.log("[Follows] No contact list event found");
      return new Set<string>();
    }

    // Extract pubkeys from 'p' tags
    const followedPubkeys = latestEvent.tags
      .filter((tag) => tag[0] === "p" && tag[1])
      .map((tag) => tag[1]!);

    console.log("[Follows] Found", followedPubkeys.length, "follows");
    return new Set(followedPubkeys);
  } catch (error) {
    console.error("[Follows] Error fetching follow list:", error);
    return new Set<string>();
  }
}

/**
 * Check if the user is following a specific pubkey
 */
export async function isFollowing(pubkey: string): Promise<boolean> {
  try {
    const follows = await fetchFollowList();
    return follows.has(pubkey);
  } catch (error) {
    console.error("[Follows] Error checking follow status:", error);
    return false;
  }
}

/**
 * Safely add a pubkey to the user's follow list
 * Preserves all existing follows
 */
export async function followUser(pubkeyToFollow: string): Promise<boolean> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !signer || !user) {
    console.error("[Follows] Missing required services:", {
      ndk: !!ndk,
      signer: !!signer,
      user: !!user,
    });
    throw new Error("NDK, signer, or user not initialized");
  }

  try {
    // Fetch current follows
    const currentFollows = await fetchFollowList();

    // Check if already following
    if (currentFollows.has(pubkeyToFollow)) {
      console.log("[Follows] Already following this user");
      return true;
    }

    // Add new follow
    currentFollows.add(pubkeyToFollow);

    // Create new contact list event
    const contactListEvent = new NDKEvent(ndk);
    contactListEvent.kind = NDKKind.Contacts;
    contactListEvent.tags = Array.from(currentFollows).map((pubkey) => [
      "p",
      pubkey,
    ]);
    contactListEvent.content = ""; // Typically empty, but some clients store relay info here
    contactListEvent.created_at = Math.floor(Date.now() / 1000);

    await contactListEvent.sign(signer);
    await contactListEvent.publish();

    console.log(
      "[Follows] Successfully followed user:",
      pubkeyToFollow.slice(0, 8),
    );
    return true;
  } catch (error) {
    console.error("[Follows] Error following user:", error);
    return false;
  }
}

/**
 * Safely remove a pubkey from the user's follow list
 * Preserves all other existing follows
 */
export async function unfollowUser(pubkeyToUnfollow: string): Promise<boolean> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !signer || !user) {
    console.error("[Follows] Missing required services:", {
      ndk: !!ndk,
      signer: !!signer,
      user: !!user,
    });
    throw new Error("NDK, signer, or user not initialized");
  }

  try {
    // Fetch current follows
    const currentFollows = await fetchFollowList();

    // Check if not following
    if (!currentFollows.has(pubkeyToUnfollow)) {
      console.log("[Follows] Not following this user");
      return true;
    }

    // Remove follow
    currentFollows.delete(pubkeyToUnfollow);

    // Create new contact list event
    const contactListEvent = new NDKEvent(ndk);
    contactListEvent.kind = NDKKind.Contacts;
    contactListEvent.tags = Array.from(currentFollows).map((pubkey) => [
      "p",
      pubkey,
    ]);
    contactListEvent.content = ""; // Typically empty, but some clients store relay info here
    contactListEvent.created_at = Math.floor(Date.now() / 1000);

    await contactListEvent.sign(signer);
    await contactListEvent.publish();

    console.log(
      "[Follows] Successfully unfollowed user:",
      pubkeyToUnfollow.slice(0, 8),
    );
    return true;
  } catch (error) {
    console.error("[Follows] Error unfollowing user:", error);
    return false;
  }
}
