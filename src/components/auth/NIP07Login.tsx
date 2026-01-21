import { useState, useEffect } from "react";
import { KeyRound, AlertCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/authStore";
import {
  hasNIP07Extension,
  getSignerCapabilities,
  isInAppWebView,
  withTimeout,
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
  const [diagnostics, setDiagnostics] = useState<
    { label: string; value: string; status: "ok" | "warn" | "error" }[] | null
  >(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const inApp = isInAppWebView();

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

  const runDiagnostics = async () => {
    setIsDiagnosing(true);
    const lines: {
      label: string;
      value: string;
      status: "ok" | "warn" | "error";
    }[] = [];
    const hasNostrNow = hasNIP07Extension();
    lines.push({
      label: "window.nostr",
      value: hasNostrNow ? "present" : "missing",
      status: hasNostrNow ? "ok" : "error",
    });

    if (!hasNostrNow) {
      setDiagnostics(lines);
      setIsDiagnosing(false);
      return;
    }

    const nostr = window.nostr as typeof window.nostr & {
      nip44?: {
        encrypt?: (pubkey: string, payload: string) => Promise<string>;
        decrypt?: (pubkey: string, payload: string) => Promise<string>;
      };
    };

    const hasNip04Now = !!(nostr.nip04?.encrypt && nostr.nip04?.decrypt);
    const hasNip44Now = !!(nostr.nip44?.encrypt && nostr.nip44?.decrypt);

    lines.push({
      label: "nip04",
      value: hasNip04Now ? "yes" : "no",
      status: hasNip04Now ? "ok" : "warn",
    });
    lines.push({
      label: "nip44",
      value: hasNip44Now ? "yes" : "no",
      status: hasNip44Now ? "ok" : "warn",
    });

    const now = () =>
      typeof performance !== "undefined" ? performance.now() : Date.now();
    let pubkey: string | null = null;

    if (typeof nostr.getPublicKey !== "function") {
      lines.push({
        label: "getPublicKey",
        value: "missing",
        status: "error",
      });
    } else {
      try {
        const start = now();
        pubkey = await withTimeout(nostr.getPublicKey(), 10000, "getPublicKey");
        const durationMs = Math.round(now() - start);
        if (!pubkey) {
          lines.push({
            label: "getPublicKey",
            value: `returned null/empty (${durationMs}ms)`,
            status: "error",
          });
        } else {
          lines.push({
            label: "getPublicKey",
            value: `ok (${durationMs}ms) ${pubkey.slice(0, 8)}...`,
            status: "ok",
          });
        }
      } catch (diagError) {
        lines.push({
          label: "getPublicKey",
          value:
            diagError instanceof Error
              ? diagError.message
              : "failed to resolve",
          status: "error",
        });
      }
    }

    if (hasNip44Now && pubkey) {
      try {
        const payload = `ghostr-diag-${Date.now()}`;
        const start = now();
        const encrypted = await withTimeout(
          nostr.nip44!.encrypt!(pubkey, payload),
          10000,
          "nip44.encrypt",
        );
        const decrypted = await withTimeout(
          nostr.nip44!.decrypt!(pubkey, encrypted),
          10000,
          "nip44.decrypt",
        );
        const durationMs = Math.round(now() - start);
        lines.push({
          label: "nip44 roundtrip",
          value: decrypted === payload ? `ok (${durationMs}ms)` : "mismatch",
          status: decrypted === payload ? "ok" : "error",
        });
      } catch (diagError) {
        lines.push({
          label: "nip44 roundtrip",
          value:
            diagError instanceof Error
              ? diagError.message
              : "failed to resolve",
          status: "error",
        });
      }
    } else {
      lines.push({
        label: "nip44 roundtrip",
        value: "skipped",
        status: "warn",
      });
    }

    setDiagnostics(lines);
    setIsDiagnosing(false);
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

      {inApp && (
        <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-3 text-blue-600 dark:text-blue-500">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">In-app browser detected</p>
            <p className="mt-1">
              Some in-app signers (like Keychat) respond slowly or hang during
              encryption. If login stalls, try again or use the NSEC tab.
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

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={runDiagnostics}
          disabled={isDiagnosing}
          className="w-full"
        >
          {isDiagnosing ? "Running diagnostics..." : "Run NIP-07 diagnostics"}
        </Button>
        {diagnostics && (
          <div className="rounded-md border border-muted p-3 text-xs font-mono space-y-1">
            {diagnostics.map((line) => (
              <div
                key={line.label}
                className={`flex items-center justify-between ${
                  line.status === "ok"
                    ? "text-green-600"
                    : line.status === "warn"
                      ? "text-yellow-600"
                      : "text-destructive"
                }`}
              >
                <span>{line.label}</span>
                <span>{line.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
