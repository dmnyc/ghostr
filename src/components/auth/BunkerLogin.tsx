import { useState, useEffect, useRef } from "react";
import { Server, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/authStore";

interface BunkerLoginProps {
  onSuccess: () => void;
}

export function BunkerLogin({ onSuccess }: BunkerLoginProps) {
  const { loginWithBunker, isLoading, error } = useAuthStore();
  const [bunkerUri, setBunkerUri] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (connecting) {
      setCountdown(60);
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [connecting]);

  const handleLogin = async () => {
    const uri = bunkerUri.trim();
    if (!uri) return;

    if (!uri.startsWith("bunker://")) {
      useAuthStore.setState({
        error:
          'URI must start with "bunker://". Check your bunker app for the connection string.',
      });
      return;
    }

    setConnecting(true);

    try {
      await loginWithBunker(uri);
      setBunkerUri("");
      setConnecting(false);
      onSuccess();
    } catch {
      setConnecting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  const isConnecting = connecting || isLoading;

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <p>
          Connect using a NIP-46 remote signer like{" "}
          <a
            href="https://zapstore.dev/apps/naddr1qvzqqqr7pvpzqateqake4lc2fn77lflzq30jfpk8uhvtccalc66989er8cdmljceqqdkxmmd9enhyet9deshyaphvvejumn0wd68yumfvahx2usx8zmj2"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Amber
          </a>{" "}
          (Android).
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Requires NIP-44 support. Encrypted features won't work without it.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bunker-uri">Bunker URI</Label>
        <Input
          id="bunker-uri"
          type="text"
          placeholder="bunker://..."
          value={bunkerUri}
          onChange={(e) => setBunkerUri(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isConnecting}
        />
      </div>

      {isConnecting && (
        <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            Waiting for bunker approval...
            {countdown > 0 && <span> ({countdown}s)</span>}
          </span>
        </div>
      )}

      {error && !isConnecting && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <Button
        onClick={handleLogin}
        disabled={isConnecting || !bunkerUri.trim()}
        className="w-full"
      >
        <Server className="mr-2 h-4 w-4" />
        {isConnecting ? "Connecting..." : "Connect with Bunker"}
      </Button>
    </div>
  );
}
