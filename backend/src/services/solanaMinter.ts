import { storage } from "./storage.js";
import type { MintResult } from "../types/index.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createNft } from "@metaplex-foundation/mpl-token-metadata";
import { keypairIdentity, publicKey, signerIdentity, generateSigner, percentAmount } from "@metaplex-foundation/umi";
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

  async mintDonationProof(params: {
    recipientWallet: string;
    amountZEC: number;
    donationId: string;
    txId: string;
  }): Promise<MintResult> {
    const { recipientWallet, amountZEC, donationId, txId } = params;

    storage.addAgentLog("info", "Starting NFT mint", { recipientWallet, amountZEC, donationId });

    if (this.mockMode) {
      const mockMint = `mint_${donationId.replace(/-/g, "").slice(0, 16)}`;
      const mockSig = `sig_${txId.slice(0, 16)}`;
      await new Promise((r) => setTimeout(r, 800));
      storage.addAgentLog("success", "NFT minted (mock mode)", {
        mintAddress: mockMint, signature: mockSig, recipientWallet,
      });
      return { success: true, mintAddress: mockMint, signature: mockSig };
    }

    try {
      const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      const umi = createUmi(rpc);
      const keypair = umi.eddsa.createKeypairFromSecretKey(loadSecretKey());
      umi.use(keypairIdentity(keypair));

      const mint = generateSigner(umi);
      const name = process.env.SOLANA_NFT_NAME || "ShieldGive Donation Proof";
      const symbol = process.env.SOLANA_NFT_SYMBOL || "SGIVE";
      const uri = process.env.SOLANA_NFT_METADATA_URI;

      if (!uri) {
        throw new Error("SOLANA_NFT_METADATA_URI is required for live minting");
      }

      const result = await createNft(umi, {
        mint,
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: percentAmount(0),
        tokenOwner: publicKey(recipientWallet),
      }).sendAndConfirm(umi);

      const signature = Buffer.from(result.signature).toString("base64");
      const mintAddress = mint.publicKey.toString();

      storage.addAgentLog("success", "NFT minted on Solana", {
        mintAddress, signature, recipientWallet, amountZEC, txId,
      });

      return { success: true, mintAddress, signature };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      storage.addAgentLog("error", "Live Solana NFT mint failed", { error, recipientWallet, txId });
      return { success: false, error };
    }
  }
}

export const solanaMinter = new SolanaMinter();
