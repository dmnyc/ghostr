/**
 * InvoiceDisplay - Shows a Lightning invoice with copy button
 * Used in wallet management and payment confirmation screens
 */

import { useState } from "react";
import { Copy, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";

interface InvoiceDisplayProps {
  bolt11: string;
  amountSats: number;
  label?: string;
}

export function InvoiceDisplay({ bolt11, amountSats, label }: InvoiceDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(bolt11);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <p className="text-sm font-medium flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-yellow-500" />
          {label}
        </p>
      )}
      <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono truncate">{bolt11}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {amountSats.toLocaleString()} sats
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleCopy} className="flex-shrink-0">
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      {/* TODO: Add QR code rendering */}
    </div>
  );
}
