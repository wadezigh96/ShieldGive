import { storage } from "./storage.js";
import type { MintResult } from "../types/index.js";

/**
 * Solana NFT minter using Metaplex (structure ready for real integration).
 *
 * For the MVP demo we return a deterministic mock mint address so the
 * full agent pipeline can be demonstrated end-to-end without requiring
 * a funded Solana keypair or network calls during judging.
 *
 * To go live:
 *   1. Install @metaplex-foundation/umi + plugins
 *   2. Load a mint-authority keypair from SOLANA_PRIVATE_KEY
 *   3. Call createNft / mintV1 against the chosen collection
 */
export class SolanaMinter {
  private mockMode: boolean;

  constructor() {
    this.mockMode =
      !process.env.SOLANA_PRIVATE_KEY ||
      process.env.SOLANA_PRIVATE_KEY === "mock";
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Mint a "Donation Proof" NFT to the given Solana wallet.
   */
  async mintDonationProof(params: {
    recipientWallet: string;
    amountZEC: number;
    donationId: string;
    txId: string;
  }): Promise<MintResult> {
    const { recipientWallet, amountZEC, donationId, txId } = params;

    storage.addAgentLog("info", "Starting NFT mint", {
      recipientWallet,
      amountZEC,
      donationId,
    });

    if (this.mockMode) {
      // Deterministic-looking mock mint address for demo
      const mockMint = `mint_${donationId.replace(/-/g, "").slice(0, 16)}`;
      const mockSig = `sig_${txId.slice(0, 16)}`;

      // Simulate a short network delay
      await new Promise((r) => setTimeout(r, 800));

      storage.addAgentLog("success", "NFT minted (mock mode)", {
        mintAddress: mockMint,
        signature: mockSig,
        recipientWallet,
      });

      return {
        success: true,
        mintAddress: mockMint,
        signature: mockSig,
      };
    }

    // ------------------------------------------------------------------
    // TODO: Real Metaplex / UMI implementation
    // ------------------------------------------------------------------
    // import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
    // import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
    // import { keypairIdentity, generateSigner, percentAmount } from "@metaplex-foundation/umi";
    //
    // const umi = createUmi(process.env.SOLANA_RPC_URL!)
    //   .use(mplTokenMetadata())
    //   .use(keypairIdentity(loadKeypair(process.env.SOLANA_PRIVATE_KEY!)));
    //
    // const mint = generateSigner(umi);
    // await createNft(umi, {
    //   mint,
    //   name: `ShieldGive Donation Proof`,
    //   symbol: "SGIVE",
    //   uri: `https://api.shieldgive.xyz/metadata/${donationId}`,
    //   sellerFeeBasisPoints: percentAmount(0),
    //   tokenOwner: publicKey(recipientWallet),
    // }).sendAndConfirm(umi);
    //
    // return { success: true, mintAddress: mint.publicKey.toString(), ... };
    // ------------------------------------------------------------------

    storage.addAgentLog(
      "error",
      "Real Solana minting not configured — set SOLANA_PRIVATE_KEY"
    );
    return {
      success: false,
      error: "Solana mint authority not configured",
    };
  }
}

export const solanaMinter = new SolanaMinter();
