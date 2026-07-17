/**
 * WalletSetup - Simple onboarding for Spark wallet
 * 
 * Allows users to:
 * - Generate a new seed phrase
 * - Import an existing seed phrase
 * - Enter their Breez API key
 */

import { useState } from "react";
import { Loader2, Wallet, Key, Copy, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWalletStore } from "@/stores/walletStore";
import { toast } from "@/hooks/useToast";

interface WalletSetupProps {
  onComplete?: () => void;
}

export function WalletSetup({ onComplete }: WalletSetupProps) {
  const { setupWallet, status } = useWalletStore();

  const [mode, setMode] = useState<"choose" | "generate" | "import">("choose");
  const [mnemonic, setMnemonic] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [confirmedBackup, setConfirmedBackup] = useState(false);

  const isConnecting = status === "connecting";

  const handleGenerateSeed = async () => {
    // TODO: Use Breez SDK to generate mnemonic
    // For prototype, instruct user to use an external tool
    setMode("generate");
    toast({
      title: "Generate seed externally",
      description:
        "For the prototype, please generate a 12-word BIP39 mnemonic using another tool and paste it below.",
    });
  };

  const handleConnect = async () => {
    const trimmedMnemonic = mnemonic.trim();
    const words = trimmedMnemonic.split(/\s+/);

    if (words.length !== 12 && words.length !== 24) {
      toast({
        title: "Invalid seed phrase",
        description: "Please enter a 12 or 24 word mnemonic",
        variant: "destructive",
      });
      return;
    }

    if (!apiKey.trim()) {
      toast({
        title: "API key required",
        description: "Please enter your Breez API key",
        variant: "destructive",
      });
      return;
    }

    try {
      await setupWallet(trimmedMnemonic, apiKey.trim());
      toast({ title: "Wallet connected!", description: "Your Lightning wallet is ready" });
      onComplete?.();
    } catch (err) {
      toast({
        title: "Connection failed",
        description: err instanceof Error ? err.message : "Could not connect wallet",
        variant: "destructive",
      });
    }
  };

  const handleCopySeed = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopiedSeed(true);
      setTimeout(() => setCopiedSeed(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  // Mode selection
  if (mode === "choose") {
    return (
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <Wallet className="h-10 w-10 mx-auto text-yellow-500" />
            <h2 className="text-lg font-semibold">Lightning Wallet Setup</h2>
            <p className="text-sm text-muted-foreground">
              Set up a self-custodial Lightning wallet to receive payments for your Ghost Notes.
              Your keys, your sats.
            </p>
          </div>

          <div className="space-y-2">
            <Button onClick={handleGenerateSeed} className="w-full" variant="outline">
              <Key className="h-4 w-4 mr-2" />
              Create New Wallet
            </Button>
            <Button onClick={() => setMode("import")} className="w-full" variant="outline">
              <Wallet className="h-4 w-4 mr-2" />
              Import Existing Seed
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Generate / Import form
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-2">
          <Wallet className="h-10 w-10 mx-auto text-yellow-500" />
          <h2 className="text-lg font-semibold">
            {mode === "generate" ? "New Wallet" : "Import Wallet"}
          </h2>
        </div>

        {/* Seed phrase */}
        <div className="space-y-2">
          <Label>Seed Phrase (12 or 24 words)</Label>
          <Textarea
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            placeholder="Enter your 12 or 24 word seed phrase..."
            rows={3}
            className="font-mono text-sm"
          />
          {mnemonic && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleCopySeed}>
                {copiedSeed ? (
                  <Check className="h-3 w-3 mr-1 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                {copiedSeed ? "Copied" : "Copy"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {mnemonic.trim().split(/\s+/).length} words
              </span>
            </div>
          )}
        </div>

        {/* API Key */}
        <div className="space-y-2">
          <Label>Breez API Key</Label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your Breez API key"
            className="w-full px-3 py-2 text-sm rounded-md border bg-background"
          />
          <p className="text-xs text-muted-foreground">
            Get a free API key at{" "}
            <a
              href="https://breez.technology/sdk/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              breez.technology/sdk
            </a>
          </p>
        </div>

        {/* Backup warning */}
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            <strong>Back up your seed phrase!</strong> This is the only way to recover your
            wallet. Ghostr does not store your seed on any server.
          </p>
        </div>

        {mode === "generate" && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmedBackup}
              onChange={(e) => setConfirmedBackup(e.target.checked)}
            />
            I have backed up my seed phrase safely
          </label>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode("choose")} className="flex-1">
            Back
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isConnecting || !mnemonic.trim() || !apiKey.trim() || (mode === "generate" && !confirmedBackup)}
            className="flex-1"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Wallet"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
