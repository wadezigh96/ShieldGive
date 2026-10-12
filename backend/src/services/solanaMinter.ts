import { storage } from "./storage.js";
import type { MintResult } from "../types/index.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, publicKey, generateSigner, percentAmount } from "@metaplex-foundation/umi";
import bs58 from "bs58";

function loadSecretKey(): Uint8Array {
  const raw = process.env.SOLANA_PRIVATE_KEY;
  if (!raw || raw === "mock") throw new Error("SOLANA_PRIVATE_KEY is not configured");
  if (raw.trim().startsWith("[")) {
    const parsed = JSON.parse(raw) as number[];
    return Uint8Array.from(parsed);
  }
  return bs58.decode(raw.trim());
}

export class SolanaMinter {
  private mockMode: boolean;

  constructor() {
    this.mockMode =
      process.env.SOLANA_MODE === "mock" ||
      !process.env.SOLANA_PRIVATE_KEY ||
      process.env.SOLANA_PRIVATE_KEY === "mock";
  }

  isMockMode(): boolean { return this.mockMode; }

  isLiveMintEnabled(): boolean {
    return !this.mockMode && process.env.SOLANA_LIVE_MINT_ENABLED === "true";
  }

  async mintDonationProof(params: {
    recipientWallet: string;
    amountZEC: number;
    donationId: string;
    txId: string;
    onPreparedMint?: (mintAddress: string) => Promise<void>;
  }): Promise<MintResult> {
    const { recipientWallet, amountZEC, donationId, txId, onPreparedMint } = params;

    await storage.addAgentLog("info", "Starting NFT mint", {
      recipientWallet, amountZEC, donationId,
    });

    // Never mint a fake proof in production, even when a secret is missing.
    if (process.env.NODE_ENV === "production" && this.mockMode) {
      const error = "Production mock minting is blocked; configure a live Solana mint authority";
      await storage.addAgentLog("error", error, { donationId, txId });
      return { success: false, error, outcomeUnknown: false };
    }

    if (this.mockMode) {
      const mockMint = `mint_${donationId.replace(/-/g, "").slice(0, 16)}`;
      const mockSig = `sig_${txId.slice(0, 16)}`;
      await new Promise((resolve) => setTimeout(resolve, 25));
      await storage.addAgentLog("success", "NFT minted (mock mode)", {
        mintAddress: mockMint, signature: mockSig, recipientWallet,
      });
      return { success: true, mintAddress: mockMint, signature: mockSig };
    }

    if (process.env.SOLANA_LIVE_MINT_ENABLED !== "true") {
      const error = "Live Solana minting is disabled; set SOLANA_LIVE_MINT_ENABLED=true explicitly";
      await storage.addAgentLog("warn", "Live Solana mint blocked by feature flag", {
        recipientWallet, txId,
      });
      return { success: false, error, outcomeUnknown: false };
    }

    let submissionAttempted = false;
    try {
      const network = process.env.SOLANA_NETWORK || "devnet";
      const rpc = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
      if (network !== "devnet" && network !== "mainnet-beta") {
        throw new Error("SOLANA_NETWORK must explicitly be devnet or mainnet-beta");
      }
      if (network === "devnet" && /mainnet/i.test(rpc)) {
        throw new Error("SOLANA_NETWORK=devnet conflicts with a mainnet RPC URL");
      }
      if (network === "mainnet-beta" && /devnet/i.test(rpc)) {
        throw new Error("SOLANA_NETWORK=mainnet-beta conflicts with a Devnet RPC URL");
      }
      if (
        network === "mainnet-beta" &&
        process.env.SOLANA_MAINNET_LIVE_MINT_ACK !== "I_UNDERSTAND_MAINNET_MINTING"
      ) {
        throw new Error("Mainnet minting requires SOLANA_MAINNET_LIVE_MINT_ACK=I_UNDERSTAND_MAINNET_MINTING");
      }
      const umi = createUmi(rpc).use(mplTokenMetadata());
      const keypair = umi.eddsa.createKeypairFromSecretKey(loadSecretKey());
      umi.use(keypairIdentity(keypair));

      const mint = generateSigner(umi);
      const name = process.env.SOLANA_NFT_NAME || "ShieldGive Donation Proof";
      const symbol = process.env.SOLANA_NFT_SYMBOL || "SGIVE";
      const uri = process.env.SOLANA_NFT_METADATA_URI;

      if (!uri) throw new Error("SOLANA_NFT_METADATA_URI is required for live minting");

      const mintAddress = mint.publicKey.toString();
      // Persist the generated candidate BEFORE submission, so an ambiguous RPC
      // outcome can be reconciled against the exact address after a restart.
      if (onPreparedMint) await onPreparedMint(mintAddress);

      // From this point, an RPC error may mean the transaction was submitted
      // but the client did not receive confirmation. Never auto-retry blindly.
      submissionAttempted = true;
      const result = await createNft(umi, {
        mint,
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: percentAmount(0),
        tokenOwner: publicKey(recipientWallet),
      }).sendAndConfirm(umi);

      const signature = bs58.encode(result.signature);

      await storage.addAgentLog("success", "NFT minted on Solana", {
        mintAddress, signature, recipientWallet, amountZEC, txId,
      });
      return { success: true, mintAddress, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await storage.addAgentLog("error", "Live Solana NFT mint failed", {
        error, recipientWallet, txId, outcomeUnknown: submissionAttempted,
      });
      return {
        success: false,
        error,
        outcomeUnknown: submissionAttempted,
        ...(submissionAttempted ? {} : {}),
      };
    }
  }
}

export const solanaMinter = new SolanaMinter();
