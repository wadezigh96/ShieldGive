import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PrivyProvider } from "@privy-io/react-auth";
import App from "./App";
import "./index.css";

const privyAppId =
  import.meta.env.VITE_PRIVY_APP_ID || "cmu88yc4n02hl0cjqmqhcgjx2";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          solana: { createOnLogin: "all-users" },
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>
);
