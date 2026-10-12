import assert from "node:assert/strict";
import { createServer } from "node:http";

(async () => {
  process.env.NODE_ENV = "production";
  process.env.SOLANA_MODE = "mock";
  process.env.SOLANA_PRIVATE_KEY = "mock";

  const express = (await import("express")).default;
  const { storage } = await import("../src/services/storage.js");
  const { createCrossL1Receipt } = await import("../src/services/crossL1Receipt.js");
  const { default: apiRouter } = await import("../src/routes/api.js");

  const wallet = "So11111111111111111111111111111111111111112";
  const donor = storage.registerDonor(wallet, "private donor note");
  const txId = "private-zcash-tx-id";
  const donation = storage.addDonation({
    txId,
    amountZEC: 0.125,
    detectedAt: new Date().toISOString(),
    status: "minted",
    solanaWallet: wallet,
    nftMintAddress: "DevnetMintAddressExample",
  });
  const receipt = createCrossL1Receipt({
    sourceTxId: txId,
    donationId: donation.id,
    amountZEC: 0.125,
    solanaWallet: wallet,
  });
  storage.updateDonation(donation.id, { crossL1Receipt: receipt });
  storage.addAgentLog("warn", "Private correlation log", {
    solanaWallet: wallet,
    memo: donor.paymentMemo,
    txId,
  });

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

    console.log("SHIELDGIVE PRODUCTION API SAFETY: PASS");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => err ? reject(err) : resolve())
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
