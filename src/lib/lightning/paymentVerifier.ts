/**
 * Payment Verifier - Checks if a Lightning payment has been made for a Ghost Note
 * 
 * In the prototype, verification works by:
 * 1. Sender creates invoice, publishes bolt11 + payment_hash with the Ghost Note
 * 2. Receiver pays the invoice externally (any Lightning wallet)
 * 3. Sender's Spark wallet receives the payment → SDK event fires
 * 4. For the receiver side, we store payment proofs locally after paying
 * 
 * TODO: In production, use NIP-57 zaps or a payment proof relay for trustless verification
 */

import { listPayments } from "./sparkWallet";

/**
 * Check if a payment hash has been paid (sender-side verification)
 * Looks through recent wallet payments for a matching hash
 */
export async function isPaymentReceived(paymentHash: string): Promise<boolean> {
  try {
    const payments = await listPayments(50);
    return payments.some(
      (p: any) => p.paymentHash === paymentHash && p.status === "complete"
    );
  } catch {
    console.warn("[PaymentVerifier] Could not check payments");
    return false;
  }
}

/**
 * Local payment proof storage (receiver side)
 * When the receiver pays an invoice, we store the preimage as proof
 */
const PAYMENT_PROOFS_KEY = "ghostr-payment-proofs";

interface PaymentProof {
  ghostNoteDTag: string;
  paymentHash: string;
  preimage?: string;
  paidAt: number;
}

function getStoredProofs(): PaymentProof[] {
  try {
    const raw = localStorage.getItem(PAYMENT_PROOFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProofs(proofs: PaymentProof[]): void {
  localStorage.setItem(PAYMENT_PROOFS_KEY, JSON.stringify(proofs));
}

/**
 * Store a payment proof after paying a Ghost Note invoice
 */
export function storePaymentProof(
  ghostNoteDTag: string,
  paymentHash: string,
  preimage?: string,
): void {
  const proofs = getStoredProofs();
  // Avoid duplicates
  if (proofs.some((p) => p.ghostNoteDTag === ghostNoteDTag)) return;
  
  proofs.push({
    ghostNoteDTag,
    paymentHash,
    preimage,
    paidAt: Math.floor(Date.now() / 1000),
  });
  saveProofs(proofs);
}

/**
 * Check if the current user has paid for a Ghost Note
 */
export function hasPaymentProof(ghostNoteDTag: string): boolean {
  const proofs = getStoredProofs();
  return proofs.some((p) => p.ghostNoteDTag === ghostNoteDTag);
}

/**
 * Get payment proof for a Ghost Note
 */
export function getPaymentProof(ghostNoteDTag: string): PaymentProof | null {
  const proofs = getStoredProofs();
  return proofs.find((p) => p.ghostNoteDTag === ghostNoteDTag) ?? null;
}
