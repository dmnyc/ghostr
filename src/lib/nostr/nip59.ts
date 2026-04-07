import {
  NDKEvent,
  NDKUser,
  NDKPrivateKeySigner,
  type NDKSigner,
} from "@nostr-dev-kit/ndk";
import { generateSecretKey } from "nostr-tools";
import type { SubmissionPayload, RetractionPayload, Submission } from "@/types/submission";
import type { ReceiptPayload } from "@/types/receipt";
import { PROTOCOL_VERSION } from "@/lib/constants";
import { useNDKStore } from "@/stores/ndkStore";
import { useAuthStore, pubkeyToNpub } from "@/stores/authStore";

const SEAL_KIND = 13;
const GIFT_WRAP_KIND = 1059;
const DM_KIND = 14;

// Randomize timestamp up to 2 days in the past (NIP-17 requirement)
function randomizeTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  const twoDays = 2 * 24 * 60 * 60;
  return now - Math.floor(Math.random() * twoDays);
}

export async function sendGiftWrappedSubmission(
  recipientPubkey: string,
  payload: SubmissionPayload,
): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  const recipient = new NDKUser({ pubkey: recipientPubkey });

  // Create the rumor (unsigned kind 14 DM)
  const rumor = {
    kind: DM_KIND,
    content: JSON.stringify(payload),
    tags: [["p", recipientPubkey]],
    created_at: randomizeTimestamp(),
    pubkey: user.pubkey,
  };

  // Create seal (kind 13) - encrypt rumor to recipient
  const sealContent = await signer.encrypt(
    recipient,
    JSON.stringify(rumor),
    "nip44",
  );

  const seal = new NDKEvent(ndk);
  seal.kind = SEAL_KIND;
  seal.content = sealContent;
  seal.created_at = randomizeTimestamp();
  await seal.sign(signer);

  // Create gift wrap (kind 1059) with ephemeral key
  const ephemeralKey = generateSecretKey();
  const ephemeralSigner = new NDKPrivateKeySigner(ephemeralKey);

  const wrapContent = await ephemeralSigner.encrypt(
    recipient,
    JSON.stringify(seal.rawEvent()),
    "nip44",
  );

  const wrap = new NDKEvent(ndk);
  wrap.kind = GIFT_WRAP_KIND;
  wrap.content = wrapContent;
  wrap.tags = [["p", recipientPubkey]];
  wrap.created_at = randomizeTimestamp();

  await wrap.sign(ephemeralSigner);

  // Race publish against a timeout - don't wait forever for slow relays
  const publishPromise = wrap.publish();
  const timeoutPromise = new Promise<void>((resolve) =>
    setTimeout(resolve, 3000),
  );
  await Promise.race([publishPromise, timeoutPromise]);
}

export async function sendGiftWrappedReceipt(
  recipientPubkey: string,
  receipt: ReceiptPayload,
): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  const recipient = new NDKUser({ pubkey: recipientPubkey });

  // Create the rumor (unsigned kind 14 DM)
  const rumor = {
    kind: DM_KIND,
    content: JSON.stringify(receipt),
    tags: [["p", recipientPubkey]],
    created_at: randomizeTimestamp(),
    pubkey: user.pubkey,
  };

  // Create seal (kind 13)
  const sealContent = await signer.encrypt(
    recipient,
    JSON.stringify(rumor),
    "nip44",
  );

  const seal = new NDKEvent(ndk);
  seal.kind = SEAL_KIND;
  seal.content = sealContent;
  seal.created_at = randomizeTimestamp();
  await seal.sign(signer);

  // Create gift wrap (kind 1059) with ephemeral key
  const ephemeralKey = generateSecretKey();
  const ephemeralSigner = new NDKPrivateKeySigner(ephemeralKey);

  const wrapContent = await ephemeralSigner.encrypt(
    recipient,
    JSON.stringify(seal.rawEvent()),
    "nip44",
  );

  const wrap = new NDKEvent(ndk);
  wrap.kind = GIFT_WRAP_KIND;
  wrap.content = wrapContent;
  wrap.tags = [["p", recipientPubkey]];
  wrap.created_at = randomizeTimestamp();

  await wrap.sign(ephemeralSigner);

  // Race publish against a timeout - don't wait forever for slow relays
  const publishPromise = wrap.publish();
  const timeoutPromise = new Promise<void>((resolve) =>
    setTimeout(resolve, 3000),
  );
  await Promise.race([publishPromise, timeoutPromise]);
}

export async function sendGiftWrappedRetraction(
  recipientPubkey: string,
  retraction: RetractionPayload,
): Promise<void> {
  const { ndk } = useNDKStore.getState();
  const { user, signer } = useAuthStore.getState();

  if (!ndk || !user || !signer) {
    throw new Error("Not connected or authenticated");
  }

  const recipient = new NDKUser({ pubkey: recipientPubkey });

  // Create the rumor (unsigned kind 14 DM)
  const rumor = {
    kind: DM_KIND,
    content: JSON.stringify(retraction),
    tags: [["p", recipientPubkey]],
    created_at: randomizeTimestamp(),
    pubkey: user.pubkey,
  };

  // Create seal (kind 13)
  const sealContent = await signer.encrypt(
    recipient,
    JSON.stringify(rumor),
    "nip44",
  );

  const seal = new NDKEvent(ndk);
  seal.kind = SEAL_KIND;
  seal.content = sealContent;
  seal.created_at = randomizeTimestamp();
  await seal.sign(signer);

  // Create gift wrap (kind 1059) with ephemeral key
  const ephemeralKey = generateSecretKey();
  const ephemeralSigner = new NDKPrivateKeySigner(ephemeralKey);

  const wrapContent = await ephemeralSigner.encrypt(
    recipient,
    JSON.stringify(seal.rawEvent()),
    "nip44",
  );

  const wrap = new NDKEvent(ndk);
  wrap.kind = GIFT_WRAP_KIND;
  wrap.content = wrapContent;
  wrap.tags = [["p", recipientPubkey]];
  wrap.created_at = randomizeTimestamp();

  await wrap.sign(ephemeralSigner);

  // Race publish against a timeout - don't wait forever for slow relays
  const publishPromise = wrap.publish();
  const timeoutPromise = new Promise<void>((resolve) =>
    setTimeout(resolve, 3000),
  );
  await Promise.race([publishPromise, timeoutPromise]);
}

export interface UnwrappedMessage {
  senderPubkey: string;
  payload: SubmissionPayload | ReceiptPayload | RetractionPayload;
  createdAt: number; // Unix timestamp from the rumor
}

/**
 * Decrypt with timeout to prevent hanging on signers that fail silently
 */
async function decryptWithTimeout(
  signer: NDKSigner,
  sender: NDKUser,
  content: string,
  timeoutMs: number = 15000,
): Promise<string> {
  const decryptPromise = signer.decrypt(sender, content, "nip44");
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Decryption timed out")), timeoutMs),
  );
  return Promise.race([decryptPromise, timeoutPromise]);
}

export async function unwrapGiftWrappedMessage(
  wrapEvent: NDKEvent,
): Promise<UnwrappedMessage | null> {
  const { ndk } = useNDKStore.getState();
  const { signer } = useAuthStore.getState();

  if (!ndk || !signer) {
    return null;
  }

  try {
    // Get the ephemeral sender
    const wrapAuthor = wrapEvent.author;

    // Decrypt outer wrap (with timeout)
    const sealJson = await decryptWithTimeout(
      signer,
      wrapAuthor,
      wrapEvent.content,
    );
    const sealData = JSON.parse(sealJson);

    // The seal was signed by the actual sender
    const sealSender = new NDKUser({ pubkey: sealData.pubkey });

    // Decrypt seal to get rumor (with timeout)
    const rumorJson = await decryptWithTimeout(
      signer,
      sealSender,
      sealData.content,
    );
    const rumor = JSON.parse(rumorJson);

    // Verify sender pubkey matches
    if (rumor.pubkey !== sealData.pubkey) {
      console.warn("Sender pubkey mismatch in gift wrap");
      return null;
    }

    // Parse the payload
    const payload = JSON.parse(rumor.content);

    // Verify it's a ghostr protocol message
    if (payload.protocol !== PROTOCOL_VERSION) {
      return null;
    }

    return {
      senderPubkey: rumor.pubkey,
      payload,
      createdAt: rumor.created_at || Math.floor(Date.now() / 1000),
    };
  } catch {
    // Expected for gift wraps from other apps - silently return null
    return null;
  }
}

export function submissionFromPayload(
  payload: SubmissionPayload,
  senderPubkey: string,
  wrapEventId: string,
  createdAt: number, // Unix timestamp in seconds
): Submission {
  return {
    id: payload.id,
    delegateNpub: pubkeyToNpub(senderPubkey),
    delegatePubkey: senderPubkey,
    content: payload.content,
    kind: payload.kind,
    tags: payload.tags,
    note: payload.note,
    receivedAt: createdAt * 1000, // Convert to milliseconds for JS Date
    status: "pending",
    giftWrapEventId: wrapEventId,
  };
}
