import assert from "node:assert/strict";
import { createServer } from "node:http";

(async () => {
  process.env.NODE_ENV = "test";
  delete process.env.DATABASE_URL;
  process.env.SOLANA_MODE = "mock";
  process.env.SOLANA_PRIVATE_KEY = "mock";
  process.env.ZCASH_MODE = "mock";

  const express = (await import("express")).default;
  const { storage, Storage } = await import("../src/services/storage.js");
  const { createCrossL1Receipt } = await import("../src/services/crossL1Receipt.js");
  const { default: apiRouter } = await import("../src/routes/api.js");
  const { solanaMinter } = await import("../src/services/solanaMinter.js");

  // Initialize the test singleton before temporarily switching NODE_ENV to production.
  await storage.initialize();

  // Explicitly prove production cannot silently fall back to RAM.
  const productionGuard = new Storage();
  process.env.NODE_ENV = "production";
  await assert.rejects(productionGuard.initialize(), /DATABASE_URL is required in production/);

  const blockedMint = await solanaMinter.mintDonationProof({
    recipientWallet: "So11111111111111111111111111111111111111112",
    amountZEC: 0.1,
    donationId: "production-guard-test",
    txId: "production-guard-tx",
  });
  assert.equal(blockedMint.success, false, "production must not report a mock mint as successful");
  assert.match(blockedMint.error || "", /Production mock minting is blocked/);
  process.env.NODE_ENV = "test";

  const wallet = "So11111111111111111111111111111111111111112";
  const donor = await storage.registerDonor(wallet, "private donor note");
  const txId = "private-zcash-tx-id";
  const donation = await storage.addDonation({
    txId,
    amountZEC: 0.125,
    detectedAt: new Date().toISOString(),
    status: "minted",
    solanaWallet: wallet,
    nftMintAddress: "DevnetMintAddressExample",
    nftMintSignature: "private-solana-signature",
  });
  const receipt = createCrossL1Receipt({
    sourceTxId: txId,
    donationId: donation.id,
    amountZEC: 0.125,
    solanaWallet: wallet,
  });
  await storage.updateDonation(donation.id, { crossL1Receipt: receipt });
  await storage.addAgentLog("warn", "Private correlation log", {
    solanaWallet: wallet,
    memo: donor.paymentMemo,
    txId,
    signature: "private-solana-signature",
  });

  process.env.NODE_ENV = "production";
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/api`;

  try {
    const simulation = await fetch(`${base}/agent/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountZEC: 0.1, memo: donor.paymentMemo }),
    });
    assert.equal(simulation.status, 403, "production must reject simulated donations");

    const donorsResponse = await fetch(`${base}/donors`);
    const donors = await donorsResponse.json() as { data: Array<Record<string, unknown>> };
    assert.equal(donors.data[0].id, donor.id);
    assert.equal("solanaWallet" in donors.data[0], false);
    assert.equal("note" in donors.data[0], false);
    assert.equal("paymentMemo" in donors.data[0], false);

    const donationsResponse = await fetch(`${base}/donations`);
    const donations = await donationsResponse.json() as { data: Array<Record<string, unknown>> };
    assert.equal(donations.data[0].id, donation.id);
    assert.equal("txId" in donations.data[0], false);
    assert.equal("solanaWallet" in donations.data[0], false);
    assert.equal("crossL1Receipt" in donations.data[0], false);
    assert.equal("nftMintSignature" in donations.data[0], false);
    assert.equal("error" in donations.data[0], false);

    const receiptsResponse = await fetch(`${base}/cross-l1/receipts`);
    const receipts = await receiptsResponse.json() as { data: { receipts: Array<Record<string, unknown>> } };
    assert.equal(receipts.data.receipts.length, 1);
    assert.equal("sourceTxId" in receipts.data.receipts[0], false);
    assert.equal("solanaWallet" in receipts.data.receipts[0], false);
    assert.equal("donationId" in receipts.data.receipts[0], false);

    const logsResponse = await fetch(`${base}/agent/logs`);
    const logs = await logsResponse.json() as { data: Array<Record<string, unknown>> };
    assert.equal("meta" in logs.data[0], false);
    assert.equal(JSON.stringify(logs).includes(wallet), false);
    assert.equal(JSON.stringify(logs).includes("private-zcash-tx-id"), false);
    assert.equal(JSON.stringify(logs).includes("private-solana-signature"), false);

    console.log("SHIELDGIVE PRODUCTION API SAFETY: PASS");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => err ? reject(err) : resolve()),
    );
    await storage.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
