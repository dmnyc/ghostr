import { useState, useEffect } from "react";
import { KeyRound, AlertCircle } from "lucide-react";
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
  const inApp = isInAppWebView();

  // Poll for window.nostr - mobile signers often inject after page load
  useEffect(() => {
    if (hasExtension) {
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

    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
    }, 10000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeout);
    };
  }, [hasExtension]);

  const hasNip44 = capabilities?.hasNip44 ?? true;
  const [diagnostics, setDiagnostics] = useState<
    { label: string; value: string; status: "ok" | "warn" | "error" }[] | null
  >(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

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

    const hasNip44Now = !!(nostr.nip44?.encrypt && nostr.nip44?.decrypt);

    lines.push({
      label: "nip44",
      value: hasNip44Now ? "supported" : "not available",
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
        pubkey = await withTimeout(nostr.getPublicKey(), 5000, "getPublicKey");
        const durationMs = Math.round(now() - start);
        if (!pubkey) {
          lines.push({
            label: "getPublicKey",
            value: `returned empty (${durationMs}ms)`,
            status: "error",
          });
        } else {
          lines.push({
            label: "getPublicKey",
            value: `ok (${durationMs}ms)`,
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
        const payload = `ghostr-test-${Date.now()}`;
        const start = now();
        const encrypted = await withTimeout(
          nostr.nip44!.encrypt!(pubkey, payload),
          5000,
          "nip44.encrypt",
        );
        const decrypted = await withTimeout(
          nostr.nip44!.decrypt!(pubkey, encrypted),
          5000,
          "nip44.decrypt",
        );
        const durationMs = Math.round(now() - start);
        lines.push({
          label: "nip44 encrypt/decrypt",
          value: decrypted === payload ? `ok (${durationMs}ms)` : "mismatch",
          status: decrypted === payload ? "ok" : "error",
        });
      } catch (diagError) {
        lines.push({
          label: "nip44 encrypt/decrypt",
          value:
            diagError instanceof Error
              ? diagError.message
              : "failed to resolve",
          status: "error",
        });
      }
    } else if (!hasNip44Now) {
      lines.push({
        label: "nip44 encrypt/decrypt",
        value: "skipped (no nip44)",
        status: "warn",
      });
    }

    setDiagnostics(lines);
    setIsDiagnosing(false);
  };

  const handleLogin = async () => {
    setLocalError(null);

    if (!hasExtension) {
      setLocalError(
        "No NIP-07 extension detected. Please install Alby, nos2x, or Sidecar.",
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
          Connect with{" "}
          <a
            href="https://getalby.com/alby-extension"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Alby
          </a>
          ,{" "}
          <a
            href="https://chromewebstore.google.com/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            nos2x
          </a>
          , or{" "}
          <a
            href="https://sidecar.top"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Sidecar
          </a>
          {" "}browser extensions.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Requires NIP-44 support. Encrypted features won't work without it.
        </p>
      </div>

      {!hasExtension && (
        <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 p-3 text-yellow-600 dark:text-yellow-500">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            No extension detected. Install{" "}
            <a
              href="https://getalby.com/alby-extension"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Alby
            </a>{" "}
            to use this method.
          </p>
        </div>
      )}

      {inApp && (
        <div className="flex items-start gap-2 rounded-md bg-blue-500/10 p-3 text-blue-600 dark:text-blue-500">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            In-app browser detected. If login stalls, try the Private Key tab.
          </p>
        </div>
      )}

      {hasExtension && !hasNip44 && (
        <div className="flex items-start gap-2 rounded-md bg-orange-500/10 p-3 text-orange-600 dark:text-orange-500">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Your extension doesn't support NIP-44, which Ghostr requires.
            Try Alby or nos2x, connect via Bunker (Amber), or use the Private Key tab.
          </p>
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
        disabled={isLoading || isDiagnosing || !hasExtension || !hasNip44}
        className="w-full"
      >
        <KeyRound className="mr-2 h-4 w-4" />
        {isLoading ? "Connecting..." : "Connect with Extension"}
      </Button>

      {hasExtension && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runDiagnostics}
            disabled={isDiagnosing || isLoading}
            className="w-full text-muted-foreground"
          >
            {isDiagnosing
              ? "Testing..."
              : "Not sure if your signer is compatible? Test it"}
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
      )}
    </div>
  );
}
