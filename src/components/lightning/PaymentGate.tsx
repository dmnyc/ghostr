/**
 * PaymentGate - "Pay X sats to unlock" UI shown to Ghost Note receivers
 * 
 * When a Ghost Note has a price, this component is shown instead of the
 * decrypt button. The receiver must pay the Lightning invoice to unlock.
 */

import { useState } from "react";
import { Zap, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { storePaymentProof, hasPaymentProof } from "@/lib/lightning/paymentVerifier";
import { toast } from "@/hooks/useToast";

interface PaymentGateProps {
  ghostNoteDTag: string;
  amountSats: number;
  bolt11: string;
  paymentHash: string;
  onPaymentConfirmed: () => void;
}

export function PaymentGate({
  ghostNoteDTag,
  amountSats,
  bolt11,
  paymentHash,
  onPaymentConfirmed,
}: PaymentGateProps) {
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Check if already paid
  if (hasPaymentProof(ghostNoteDTag)) {
    onPaymentConfirmed();
    return null;
  }

  const handleCopyInvoice = async () => {
    try {
      await navigator.clipboard.writeText(bolt11);
      setCopiedInvoice(true);
      setTimeout(() => setCopiedInvoice(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleConfirmPayment = async () => {
    setIsVerifying(true);
    
    // In the prototype, we trust the user's confirmation
    // TODO: Verify payment on-chain or via sender's relay notification
    storePaymentProof(ghostNoteDTag, paymentHash);
    
    toast({ title: "Payment confirmed!", description: "Unlocking Ghost Note..." });
    
    setTimeout(() => {
      setIsVerifying(false);
      onPaymentConfirmed();
    }, 500);
  };

  const formatSats = (sats: number): string => {
    return sats.toLocaleString();
  };

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5">
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-2">
          <Zap className="h-10 w-10 mx-auto text-yellow-500" />
          <h3 className="text-lg font-semibold">Paid Ghost Note</h3>
          <p className="text-sm text-muted-foreground">
            This message requires a Lightning payment to unlock
          </p>
        </div>

        {/* Price */}
        <div className="text-center py-3">
          <span className="text-3xl font-bold text-yellow-500">
            {formatSats(amountSats)}
          </span>
          <span className="text-lg text-muted-foreground ml-2">sats</span>
        </div>

        {/* Invoice */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            Pay with any Lightning wallet:
          </p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs bg-muted p-2 rounded break-all overflow-hidden max-h-20">
              {bolt11}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopyInvoice}
              className="flex-shrink-0"
            >
              {copiedInvoice ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* QR Code placeholder */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {/* TODO: Add QR code rendering with a lightweight library */}
            Scan QR code or copy invoice above
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            onClick={handleConfirmPayment}
            disabled={isVerifying}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                I've Paid — Unlock Note
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Payment goes directly to the sender's self-custodial wallet.
            No middleman.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
