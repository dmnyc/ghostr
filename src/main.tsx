import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { initializeBotSigner } from "@/lib/ndk/botSigner";
import { initializeKeychatShim } from "@/lib/keychatShim";
import { QueryProvider } from "@/providers/QueryProvider";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

// Initialize keychat shim and bot signer before React render
console.log("[Ghostr] Starting initialization...");
console.log(
  "[Ghostr] flutter_inappwebview:",
  typeof (window as unknown as { flutter_inappwebview?: unknown })
    .flutter_inappwebview,
);
console.log("[Ghostr] window.nostr:", typeof window.nostr);
initializeKeychatShim();
initializeBotSigner();
console.log("[Ghostr] Initialization complete, rendering React...");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryProvider>
    </ErrorBoundary>
  </StrictMode>,
);
