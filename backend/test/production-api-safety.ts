import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generateKeyPairSync, sign as signEd25519 } from "node:crypto";
import bs58 from "bs58";

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

  // Use a real Ed25519 keypair so this test covers the wallet ownership challenge,
  // one-time challenge consumption, and session-protected private status endpoint.
  const keypair = generateKeyPairSync("ed25519");
  const publicKeyDer = keypair.publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const wallet = bs58.encode(publicKeyDer.subarray(publicKeyDer.length - 32));
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
  await storage.updateDonation(donation.id, {
    crossL1Receipt: {
      ...receipt,
      status: "solana_proof_minted",
      solanaMintAddress: "DevnetMintAddressExample",
    },
  });
  const otherWallet = bs58.encode(Buffer.alloc(32, 7));
  await storage.addDonation({
    txId: "another-private-zcash-tx-id",
    amountZEC: 9.99,
    detectedAt: new Date(Date.now() + 1000).toISOString(),
    status: "minted",
    solanaWallet: otherWallet,
    nftMintAddress: "OtherDevnetMintAddress",
  });
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

    const privateWithoutSession = await fetch(`${base}/donations/mine`);
    assert.equal(privateWithoutSession.status, 401, "private donation status must require wallet proof");

    const challengeResponse = await fetch(`${base}/wallet/challenge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ solanaWallet: wallet }),
    });
    assert.equal(challengeResponse.status, 201);
    const challengeJson = await challengeResponse.json() as {
      data: { challengeId: string; solanaWallet: string; message: string; expiresAt: string };
    };
    assert.equal(challengeJson.data.solanaWallet, wallet);
    assert.match(challengeJson.data.message, /This will not send a transaction/);

    const signature = signEd25519(
      null,
      Buffer.from(challengeJson.data.message, "utf8"),
      keypair.privateKey,
    ).toString("base64");
    const sessionResponse = await fetch(`${base}/wallet/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        solanaWallet: wallet,
        challengeId: challengeJson.data.challengeId,
        message: challengeJson.data.message,
        signature,
      }),
    });
    assert.equal(sessionResponse.status, 201, "valid Solana signature should create a short-lived status session");
    const sessionJson = await sessionResponse.json() as { data: { token: string; solanaWallet: string } };
    assert.equal(sessionJson.data.solanaWallet, wallet);
    assert.ok(sessionJson.data.token.length >= 30);

    const replayedChallenge = await fetch(`${base}/wallet/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        solanaWallet: wallet,
        challengeId: challengeJson.data.challengeId,
        message: challengeJson.data.message,
        signature,
      }),
    });
    assert.equal(replayedChallenge.status, 401, "challenge must be one-time-use");

    const unauthenticatedRegistration = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ solanaWallet: wallet }),
    });
    assert.equal(unauthenticatedRegistration.status, 401, "wallet registration must require ownership proof");

    const otherWallet = bs58.encode(Buffer.alloc(32, 7));
    const mismatchedRegistration = await fetch(`${base}/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionJson.data.token}`,
      },
      body: JSON.stringify({ solanaWallet: otherWallet }),
    });
    assert.equal(mismatchedRegistration.status, 403, "a session cannot register another wallet");

    const authorizedRegistration = await fetch(`${base}/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessionJson.data.token}`,
      },
      body: JSON.stringify({ solanaWallet: wallet }),
    });
    assert.equal(authorizedRegistration.status, 201);

    const privateResponse = await fetch(`${base}/donations/mine`, {
      headers: { authorization: `Bearer ${sessionJson.data.token}` },
    });
    assert.equal(privateResponse.status, 200);
    const privateJson = await privateResponse.json() as { data: Array<Record<string, unknown>> };
    assert.equal(privateJson.data.length, 1, "a wallet session cannot read another wallet's donation");
    assert.equal(privateJson.data[0].txId, txId);
    assert.equal(privateJson.data[0].solanaWallet, wallet);
    assert.equal(privateJson.data[0].amountZEC, 0.125);

    const donorsResponse = await fetch(`${base}/donors`);
    const donors = await donorsResponse.json() as { data: Array<Record<string, unknown>> };
    assert.equal(donors.data.length, 0, "production must not publish a donor directory");

    const donationsResponse = await fetch(`${base}/donations`);
    const donations = await donationsResponse.json() as { data: Array<Record<string, unknown>> };
    assert.equal(donations.data.length, 2, "public gallery includes completed proof objects only");
    const publicProof = donations.data.find((item) => item.id === donation.id);
    assert.ok(publicProof);
    assert.equal(publicProof.status, "minted");
    assert.equal(publicProof.nftMintAddress, "DevnetMintAddressExample");
    for (const proof of donations.data) {
      assert.equal("txId" in proof, false);
      assert.equal("solanaWallet" in proof, false);
      assert.equal("amountZEC" in proof, false);
      assert.equal("detectedAt" in proof, false);
      assert.equal("crossL1Receipt" in proof, false);
      assert.equal("nftMintSignature" in proof, false);
      assert.equal("error" in proof, false);
    }

    const receiptsResponse = await fetch(`${base}/cross-l1/receipts`);
    const receipts = await receiptsResponse.json() as { data: { receipts: Array<Record<string, unknown>> } };
    assert.equal(receipts.data.receipts.length, 1);
    assert.equal("sourceTxId" in receipts.data.receipts[0], false);
    assert.equal("solanaWallet" in receipts.data.receipts[0], false);
    assert.equal("donationId" in receipts.data.receipts[0], false);
    assert.equal("amountZEC" in receipts.data.receipts[0], false);
    assert.equal("createdAt" in receipts.data.receipts[0], false);

    const logsResponse = await fetch(`${base}/agent/logs`);
    const logs = await logsResponse.json() as { data: Array<Record<string, unknown>> };
    assert.equal("meta" in logs.data[0], false);
    assert.equal(JSON.stringify(logs).includes(wallet), false);
    assert.equal(JSON.stringify(logs).includes("private-zcash-tx-id"), false);
    assert.equal(JSON.stringify(logs).includes("private-solana-signature"), false);

    console.log("SHIELDGIVE PRODUCTION API SAFETY + SIGNED WALLET ACCESS: PASS");
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
