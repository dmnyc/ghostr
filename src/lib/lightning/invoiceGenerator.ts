/**
 * Invoice Generator - Creates Lightning invoices for paid Ghost Notes
 */

import { createInvoice } from "./sparkWallet";

export interface GhostNoteInvoice {
  bolt11: string;
  paymentHash: string;
  amountSats: number;
  description: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Create a Lightning invoice for a Ghost Note
 */
export async function createGhostNoteInvoice(
  amountSats: number,
  ghostNoteDTag: string,
): Promise<GhostNoteInvoice> {
  if (amountSats <= 0) {
    throw new Error("Amount must be greater than 0 sats");
  }

  if (amountSats > 1_000_000) {
    throw new Error("Amount exceeds maximum (1,000,000 sats)");
  }

  const description = `Ghost Note unlock: ${ghostNoteDTag}`;
  const now = Math.floor(Date.now() / 1000);

  const response = await createInvoice(amountSats, description);

  return {
    bolt11: response.invoice ?? response.bolt11 ?? "",
    paymentHash: response.paymentHash ?? "",
    amountSats,
    description,
    createdAt: now,
    expiresAt: now + 3600, // 1 hour expiry
  };
}
