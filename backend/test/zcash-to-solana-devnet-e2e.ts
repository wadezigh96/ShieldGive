import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Connection } from "@solana/web3.js";

(async () => {
  const recipientWallet = process.env.SOLANA_TEST_RECIPIENT;
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  const metadataUri = process.env.SOLANA_NFT_METADATA_URI;

  assert.ok(recipientWallet, "SOLANA_TEST_RECIPIENT is required");
  assert.ok(privateKey && privateKey !== "mock", "SOLANA_PRIVATE_KEY must be configured for live Devnet E2E");
  assert.ok(metadataUri, "SOLANA_NFT_METADATA_URI is required");

  const campaignAddress = "zs1shieldgive-devnet-e2e";
  const txId = "devnet-e2e-zcash-tx-001";
  const amountZEC = 0.01;

  process.env.ZCASH_MODE = "live";
  process.env.ZCASH_RPC_USER = "test";
  process.env.ZCASH_RPC_PASSWORD = "test";
  process.env.CAMPAIGN_SHIELDED_ADDRESS = campaignAddress;
  process.env.ZCASH_MIN_CONFIRMATIONS = "1";

  process.env.SOLANA_MODE = "live";
  process.env.SOLANA_LIVE_MINT_ENABLED = "true";
  process.env.SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet";
  process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

  const { storage } = await import("../src/services/storage.js");
  const donor = storage.registerDonor(recipientWallet, "Devnet live E2E donor");
  const memo = donor.paymentMemo;
  const memoHex = Buffer.from(memo, "utf8").toString("hex");

  const rpcServer = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const request = JSON.parse(body);
        assert.equal(request.method, "z_listreceivedbyaddress");
        assert.deepEqual(request.params, [campaignAddress, 1]);

        const payload = {
          jsonrpc: "1.0",
          id: request.id,
          result: [{
            pool: "sapling",
            txid: txId,
            amount: amountZEC,
            amountZat: 1_000_000,
            memo: memoHex,
            confirmations: 2,
            blockheight: 100,
            blocktime: Math.floor(Date.now() / 1000),
          }],
        };

        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      } catch (error) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "1.0",
          id: null,
          error: { message: error instanceof Error ? error.message : String(error) },
        }));
      }
    });
  });

  await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));
  const address = rpcServer.address();
  assert.ok(address && typeof address === "object");
  process.env.ZCASH_RPC_URL = `http://127.0.0.1:${address.port}`;

  try {
    const { zcashWatcher } = await import("../src/services/zcashWatcher.js");
    const { processIncomingTx } = await import("../src/agent/pipeline.js");

    const received = await zcashWatcher.pollIncoming();
    assert.equal(received.length, 1);
    assert.equal(received[0].txId, txId);
    assert.equal(received[0].amountZEC, amountZEC);
    assert.equal(received[0].memo, memo);

    await processIncomingTx(received[0]);

    const donation = storage.getDonations()[0];

    if (donation.status !== "minted") {
      console.error("=== E2E MINT FAILURE ===");
      console.error(JSON.stringify({
        donation,
        logs: storage.getAgentLogs(20),
      }, null, 2));
    }

    assert.equal(donation.status, "minted", donation.error || "Donation pipeline did not mint");
    assert.equal(donation.solanaWallet, recipientWallet);
    assert.ok(donation.nftMintAddress);
    assert.equal(donation.crossL1Receipt?.status, "solana_proof_minted");
    assert.equal(donation.crossL1Receipt?.sourceTxId, txId);
    assert.equal(donation.crossL1Receipt?.destinationChain, "solana");
    assert.equal(storage.getCampaign().totalRaisedZEC, amountZEC);

    const mintLog = storage.getAgentLogs().find(
      (entry) =>
        entry.message === "NFT minted on Solana" &&
        entry.meta?.txId === txId
    );
    assert.ok(mintLog);
    assert.equal(typeof mintLog.meta?.signature, "string");
    const signature = mintLog.meta?.signature as string;
    assert.ok(signature.length >= 80);

    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
    const tx = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    assert.ok(tx, "Solana Devnet transaction was not found");
    assert.equal(tx.meta?.err, null, "Solana Devnet transaction failed");

    console.log("SHIELDGIVE ZCASH -> SOLANA DEVNET E2E: PASS");
    console.log(JSON.stringify({
      txId,
      amountZEC,
      donorId: donor.id,
      donationStatus: donation.status,
      receiptStatus: donation.crossL1Receipt?.status,
      mintAddress: donation.nftMintAddress,
      signature,
      slot: tx.slot,
      transactionError: tx.meta?.err ?? null,
    }, null, 2));
  } finally {
    await new Promise<void>((resolve, reject) =>
      rpcServer.close((err) => err ? reject(err) : resolve())
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
