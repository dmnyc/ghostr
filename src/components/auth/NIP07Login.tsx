import { useState, useEffect } from "react";
import { KeyRound, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import {
  hasNIP07Extension,
  getSignerCapabilities,
  type SignerCapabilities,
} from "@/lib/ndk/signers";

interface NIP07LoginProps {
  onSuccess: () => void;
}

export function NIP07Login({ onSuccess }: NIP07LoginProps) {
  const { loginWithNIP07, isLoading, error } = useAuthStore();
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasExtension, setHasExtension] = useState(hasNIP07Extension());
  const [capabilities, setCapabilities] = useState<SignerCapabilities | null>(
    null,
  );

  // Poll for window.nostr - mobile signers often inject after page load
  useEffect(() => {
    if (hasExtension) {
      // Check capabilities once extension is detected
      setCapabilities(getSignerCapabilities());
      return;
    }

    const checkInterval = setInterval(() => {
      if (hasNIP07Extension()) {
        setHasExtension(true);
        setCapabilities(getSignerCapabilities());
        clearInterval(checkInterval);
      }
    }, 500);

    // Stop checking after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [hasExtension]);

  const hasNip04 = capabilities?.hasNip04 ?? true; // Assume true if not yet checked

  const handleLogin = async () => {
    setLocalError(null);

    if (!hasExtension) {
      setLocalError(
        "No NIP-07 extension detected. Please install Alby or nos2x.",
      );
      return;
    }

    try {
      await loginWithNIP07();
      onSuccess();
    } catch {
      // Error is handled in the store
    }
  };

  const displayError = localError || error;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <p>
          Login using your browser extension (Alby, nos2x, or similar). This is
          the recommended and most secure method.
        </p>
      </div>

      {!hasExtension && (
        <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 p-3 text-yellow-600 dark:text-yellow-500">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">No extension detected</p>
            <p className="mt-1">
              Install{" "}
              <a
                href="https://getalby.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Alby
              </a>{" "}
              or{" "}
              <a
                href="https://github.com/nickreynolds/nos2x"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                nos2x
              </a>{" "}
              to use this login method.
            </p>
          </div>
        </div>
      )}

      {hasExtension && !hasNip04 && (
        <div className="flex items-start gap-2 rounded-md bg-orange-500/10 p-3 text-orange-600 dark:text-orange-500">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Limited signer support</p>
            <p className="mt-1">
              Your signer doesn't support NIP-04 encryption. Ghost Notes and
              encrypted messages may not work. Consider using a different signer
              like Alby or logging in with your nsec.
            </p>
          </div>
        </div>
      )}

      {displayError && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{displayError}</span>
        </div>
      )}

      <Button
        onClick={handleLogin}
        disabled={isLoading || !hasExtension}
        className="w-full"
      >
        <KeyRound className="mr-2 h-4 w-4" />
        {isLoading ? "Connecting..." : "Connect with Extension"}
      </Button>
    </div>
  );
}
