import "dotenv/config";
import assert from "node:assert/strict";
import type { CrossL1DonationReceipt } from "../src/types/index.js";

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "shieldgive-reconcile", method, params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Solana RPC HTTP ${response.status}`);
  const payload = await response.json() as {
    result?: T;
    error?: { code?: number; message?: string };
  };
  if (payload.error) {
    throw new Error(`Solana RPC error ${payload.error.code ?? ""}: ${payload.error.message || "unknown"}`);
  }
  return payload.result as T;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const donationId = process.env.SHIELDGIVE_RECONCILE_DONATION_ID;
  const mintAddress = process.env.SHIELDGIVE_RECONCILE_MINT_ADDRESS;
  const signature = process.env.SHIELDGIVE_RECONCILE_SIGNATURE;
  const acknowledgement = process.env.SHIELDGIVE_RECONCILE_CONFIRM;
  const network = process.env.SOLANA_NETWORK;
  const rpcUrl = process.env.SOLANA_RPC_URL;

  assert.ok(databaseUrl, "DATABASE_URL is required");
  assert.ok(donationId, "SHIELDGIVE_RECONCILE_DONATION_ID is required");
  assert.ok(mintAddress, "SHIELDGIVE_RECONCILE_MINT_ADDRESS is required");
  assert.ok(signature, "SHIELDGIVE_RECONCILE_SIGNATURE is required");
  assert.equal(
    acknowledgement,
    "CONFIRM_RECONCILED_ONCHAIN_MINT",
    "Set SHIELDGIVE_RECONCILE_CONFIRM=CONFIRM_RECONCILED_ONCHAIN_MINT only after reviewing the target",
  );
  assert.ok(network === "devnet" || network === "mainnet-beta", "SOLANA_NETWORK must be devnet or mainnet-beta");
  assert.ok(rpcUrl, "SOLANA_RPC_URL must be configured explicitly");
  if (network === "devnet") {
    assert.match(rpcUrl, /devnet/i, "Devnet reconciliation requires a Devnet RPC URL");
  } else {
    assert.match(rpcUrl, /mainnet/i, "Mainnet reconciliation requires a Mainnet RPC URL");
    assert.equal(
      process.env.SOLANA_MAINNET_LIVE_MINT_ACK,
      "I_UNDERSTAND_MAINNET_MINTING",
      "Mainnet reconciliation requires the explicit Mainnet acknowledgement",
    );
  }

  const { storage } = await import("../src/services/storage.js");
  try {
    await storage.initialize();
    assert.equal(await storage.getStorageMode(), "postgres", "Reconciliation requires durable PostgreSQL");

    const donation = await storage.findDonationById(donationId);
    assert.ok(donation, "Donation ID was not found in PostgreSQL");
    assert.ok(
      donation.status === "minting" || donation.status === "mint_unknown" || donation.status === "minted",
      `Donation status ${donation.status} is not eligible for reconciliation`,
    );
    assert.equal(
      donation.nftMintAddress,
      mintAddress,
      "Mint address does not match the candidate persisted before RPC submission",
    );
    assert.ok(donation.solanaWallet, "Donation has no persisted recipient wallet");

    type SolanaTransaction = {
      slot: number;
      meta: {
        err: unknown;
        postTokenBalances?: Array<{
          mint: string;
          owner?: string;
          uiTokenAmount?: { amount?: string; decimals?: number };
        }> | null;
      } | null;
      transaction: {
        message: { accountKeys: Array<string | { pubkey: string }> };
      };
    };
    const tx = await rpc<SolanaTransaction | null>(rpcUrl, "getTransaction", [
      signature,
      { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
    ]);
    assert.ok(tx, "Solana RPC has not returned this signature at confirmed commitment");
    assert.ok(tx.meta, "Confirmed Solana transaction is missing metadata");
    assert.equal(tx.meta.err, null, "Solana transaction failed on-chain");

    const accountKeys = tx.transaction.message.accountKeys.map((entry) =>
      typeof entry === "string" ? entry : entry.pubkey,
    );
    const balances = tx.meta.postTokenBalances || [];
    const nftBalance = balances.find((balance) =>
      balance.mint === mintAddress &&
      balance.owner === donation.solanaWallet &&
      balance.uiTokenAmount?.amount === "1" &&
      balance.uiTokenAmount?.decimals === 0,
    );
    assert.ok(
      nftBalance,
      "Confirmed transaction must show exactly one token of this mint owned by the persisted recipient wallet",
    );
    assert.ok(
      accountKeys.includes(mintAddress) || balances.some((balance) => balance.mint === mintAddress),
      "Mint address was not present in the confirmed transaction",
    );

    const mintAccount = await rpc<{
      value?: { owner?: string } | null;
    }>(rpcUrl, "getAccountInfo", [mintAddress, { commitment: "confirmed", encoding: "base64" }]);
    assert.ok(mintAccount.value, "NFT mint account does not exist at the selected Solana RPC");
    assert.ok(
      mintAccount.value.owner === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
      mintAccount.value.owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "Candidate mint account is not owned by a recognized Solana token program",
    );

    const reconciled = await storage.completeMintReconciliation(
      donation.id,
      mintAddress,
      signature,
    );
    const receipt = reconciled.crossL1Receipt as CrossL1DonationReceipt | undefined;
    assert.equal(reconciled.status, "minted");
    assert.equal(reconciled.nftMintAddress, mintAddress);
    assert.equal(reconciled.nftMintSignature, signature);
    assert.equal(receipt?.status, "solana_proof_minted");
    assert.equal(await storage.isTxProcessed(reconciled.txId), true);

    await storage.addAgentLog("success", "Ambiguous Solana mint reconciled against confirmed chain state", {
      donationId: reconciled.id,
      txId: reconciled.txId,
      mintAddress,
      signature,
      slot: tx.slot,
      network,
    });

    console.log("SHIELDGIVE ON-CHAIN MINT RECONCILIATION: PASS");
    console.log(JSON.stringify({
      donationId: reconciled.id,
      status: reconciled.status,
      mintAddress,
      signature,
      recipientMatches: true,
      confirmedSlot: tx.slot,
      network,
      fundsMovedAcrossChains: false,
    }, null, 2));
  } finally {
    await storage.close();
  }
}

main().catch((error) => {
  console.error("Reconciliation refused:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
