import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { initializeBotSigner } from "@/lib/ndk/botSigner";
import { initializeKeychatShim } from "@/lib/keychatShim";
import { QueryProvider } from "@/providers/QueryProvider";

// Initialize keychat shim and bot signer before React render
initializeKeychatShim();
initializeBotSigner();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryProvider>
  </StrictMode>,
);
