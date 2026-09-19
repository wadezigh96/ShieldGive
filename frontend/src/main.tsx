import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import App from "./App";
import "./index.css";

const privyAppId =
  import.meta.env.VITE_PRIVY_APP_ID || "cmu88yc4n02hl0cjqmqhcgjx2";

const solanaConnectors = toSolanaWalletConnectors();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        // ShieldGive uses Solana only for the public contribution-proof wallet.
        appearance: {
          walletChainType: "solana-only",
          showWalletLoginFirst: true,
          // Restrict the wallet picker to Solana wallets so EVM wallets are not offered.
          walletList: ["phantom", "solflare"],
        },
        loginMethods: ["wallet"],
        embeddedWallets: {
          ethereum: { createOnLogin: "off" },
          solana: { createOnLogin: "all-users" },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>
);
