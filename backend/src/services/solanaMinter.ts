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
  }): Promise<MintResult> {
    const { recipientWallet, amountZEC, donationId, txId } = params;

    await storage.addAgentLog("info", "Starting NFT mint", {
      recipientWallet, amountZEC, donationId,
    });

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
      const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const umi = createUmi(rpc).use(mplTokenMetadata());
      const keypair = umi.eddsa.createKeypairFromSecretKey(loadSecretKey());
      umi.use(keypairIdentity(keypair));

      const mint = generateSigner(umi);
      const name = process.env.SOLANA_NFT_NAME || "ShieldGive Donation Proof";
      const symbol = process.env.SOLANA_NFT_SYMBOL || "SGIVE";
      const uri = process.env.SOLANA_NFT_METADATA_URI;

      if (!uri) throw new Error("SOLANA_NFT_METADATA_URI is required for live minting");

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
      const mintAddress = mint.publicKey.toString();

      await storage.addAgentLog("success", "NFT minted on Solana", {
        mintAddress, signature, recipientWallet, amountZEC, txId,
      });
      return { success: true, mintAddress, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await storage.addAgentLog("error", "Live Solana NFT mint failed", {
        error, recipientWallet, txId, outcomeUnknown: submissionAttempted,
      });
      return { success: false, error, outcomeUnknown: submissionAttempted };
    }
  }
}

export const solanaMinter = new SolanaMinter();
