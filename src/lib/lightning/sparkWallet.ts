/**
 * Spark Wallet - Breez SDK Spark wrapper for Ghostr
 * 
 * Modeled after Sporky's wallet.ts patterns.
 * Provides self-custodial Lightning wallet functionality for Ghost Note payments.
 */

// TODO: Uncomment when @breeztech/breez-sdk-spark is installed
// import type {
//   BreezSdk,
//   Config,
//   GetInfoResponse,
//   ReceivePaymentRequest,
//   ReceivePaymentResponse,
//   Payment,
//   ListPaymentsRequest,
//   SdkEvent,
//   EventListener,
//   LogEntry,
// } from "@breeztech/breez-sdk-spark";

// Placeholder types until SDK is installed
type BreezSdk = any;
type GetInfoResponse = any;
type ReceivePaymentResponse = any;
type Payment = any;
type SdkEvent = any;

let sdk: BreezSdk | null = null;
let eventListenerId: string | null = null;
let onPaymentReceived: ((event: SdkEvent) => void) | null = null;

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${operation} timed out after ${timeoutMs / 1000}s`)),
        timeoutMs,
      ),
    ),
  ]);
}

function requireSdk(): BreezSdk {
  if (!sdk) throw new Error("Wallet not connected. Please set up your Lightning wallet first.");
  return sdk;
}

/**
 * Load the Breez Spark SDK module, handling CJS/ESM wrapping
 */
async function loadSdk() {
  const mod = await import("@breeztech/breez-sdk-spark");
  const breez = (mod as Record<string, unknown>).default ?? mod;
  return breez as any;
}

/**
 * Generate a new 12-word mnemonic seed phrase
 */
export async function generateMnemonic(): Promise<string> {
  // TODO: Use Breez SDK's mnemonic generation when available
  // For now, use a web crypto approach
  const breez = await loadSdk();
  if (breez.generateMnemonic) {
    return await breez.generateMnemonic();
  }
  // Fallback: This should use a proper BIP39 implementation
  throw new Error("Mnemonic generation not available. Please provide a seed phrase.");
}

/**
 * Connect to Spark wallet with a mnemonic seed phrase
 */
export async function connectWallet(
  mnemonic: string,
  apiKey: string,
  network: string = "mainnet",
): Promise<void> {
  if (sdk) return;

  const breez = await loadSdk();

  const sdkConfig = breez.defaultConfig(network);
  sdkConfig.apiKey = apiKey;
  sdkConfig.privateEnabledDefault = true;

  sdk = await withTimeout(
    breez.connect({
      config: sdkConfig,
      seed: { 
        type: "mnemonic", 
        mnemonic: mnemonic.trim().toLowerCase().replace(/\s+/g, " ") 
      },
    }),
    60000,
    "Spark SDK connect",
  );

  // Set up event listener for payment notifications
  const listener = {
    onEvent: (event: SdkEvent) => {
      if (onPaymentReceived && event.type === "paymentReceived") {
        onPaymentReceived(event);
      }
    },
  };
  eventListenerId = await sdk!.addEventListener(listener);

  // Background sync
  sdk!.syncWallet({}).catch(() => {
    console.warn("[SparkWallet] Background sync failed");
  });
}

/**
 * Disconnect from the Spark wallet
 */
export async function disconnectWallet(): Promise<void> {
  if (!sdk) return;

  try {
    if (eventListenerId) {
      await sdk.removeEventListener(eventListenerId).catch(() => {});
      eventListenerId = null;
    }
    await sdk.disconnect();
  } catch {
    // Ignore disconnect errors
  } finally {
    sdk = null;
    onPaymentReceived = null;
  }
}

/**
 * Get wallet info (balance, etc.)
 */
export async function getInfo(): Promise<GetInfoResponse> {
  const s = requireSdk();
  return await s.getInfo({ ensureSynced: false });
}

/**
 * Get wallet balance in sats
 */
export async function getBalanceSats(): Promise<number> {
  const info = await getInfo();
  return info.balanceSat ?? 0;
}

/**
 * Create a Lightning invoice for receiving payment
 */
export async function createInvoice(
  amountSats: number,
  description?: string,
): Promise<ReceivePaymentResponse> {
  const s = requireSdk();
  return await withTimeout(
    s.receivePayment({
      amountSat: amountSats,
      description: description || "Ghost Note unlock payment",
    }),
    20000,
    "Create invoice",
  );
}

/**
 * List recent payments
 */
export async function listPayments(limit: number = 20): Promise<Payment[]> {
  const s = requireSdk();
  const response = await withTimeout(
    s.listPayments({ limit }),
    10000,
    "List payments",
  );
  return (response as any).payments;
}

/**
 * Set a callback for when a payment is received
 */
export function setPaymentReceivedCallback(
  callback: ((event: SdkEvent) => void) | null,
): void {
  onPaymentReceived = callback;
}

/**
 * Check if the wallet is currently connected
 */
export function isConnected(): boolean {
  return sdk !== null;
}

/**
 * Sync wallet state
 */
export async function syncWallet(): Promise<void> {
  const s = requireSdk();
  await withTimeout(s.syncWallet({}), 90000, "Wallet sync");
}
