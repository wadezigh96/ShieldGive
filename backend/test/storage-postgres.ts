import assert from "node:assert/strict";
import { Storage } from "../src/services/storage.js";
import { createCrossL1Receipt } from "../src/services/crossL1Receipt.js";

(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required; this test must run against PostgreSQL");
  }
  process.env.NODE_ENV = "test";

  const first = new Storage();
  const second = new Storage();
  let afterRestart: Storage | undefined;

  try {
    await Promise.all([first.initialize(), second.initialize()]);

    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const wallet = `ShieldGiveStorageTestWallet-${runId}`;
    const txId = `shieldgive-postgres-test-${runId}`;
    const now = new Date().toISOString();

    const donor = await first.registerDonor(wallet, "storage integration test");
    const duplicateDonor = await second.registerDonor(wallet, "must not replace existing registration");
    assert.equal(duplicateDonor.id, donor.id, "wallet uniqueness must hold across instances");

    const walletChallenge = await first.createWalletChallenge(wallet);
    const challengeFromSecond = await second.getWalletChallenge(walletChallenge.id);
    assert.equal(challengeFromSecond?.message, walletChallenge.message);
    assert.equal(
      await second.consumeWalletChallenge(walletChallenge.id, wallet, walletChallenge.message),
      true,
      "a valid wallet challenge can be consumed by another backend instance",
    );
    assert.equal(
      await first.consumeWalletChallenge(walletChallenge.id, wallet, walletChallenge.message),
      false,
      "wallet challenge consumption must be one-time",
    );
    const walletSession = await first.createWalletSession(wallet);
    assert.equal(await second.getWalletForSession(walletSession.token), wallet);

    const input = {
      txId,
      amountZEC: 0.375,
      detectedAt: now,
      status: "pending" as const,
      solanaWallet: wallet,
    };
    const [donationA, donationB] = await Promise.all([
      first.getOrCreateDonation(input),
      second.getOrCreateDonation(input),
    ]);
    assert.equal(donationA.id, donationB.id, "a source tx must map to a single durable donation row");

    const receipt = createCrossL1Receipt({
      sourceTxId: txId,
      donationId: donationA.id,
      amountZEC: 0.375,
      solanaWallet: wallet,
      createdAt: now,
    });
    const prepared = await Promise.all([
      first.markDonationValidated(donationA.id, receipt, wallet),
      second.markDonationValidated(donationA.id, receipt, wallet),
    ]);
    assert.ok(prepared.every(Boolean), "a prepared donation should remain claimable");
    const claims = await Promise.all([
      first.claimDonationMint(donationA.id),
      second.claimDonationMint(donationA.id),
    ]);
    assert.equal(claims.filter(Boolean).length, 1, "only one instance may claim the mint");

    const owner = claims[0] ? first : second;
    await owner.updateDonation(donationA.id, {
      status: "minted",
      nftMintAddress: "postgres-test-mint",
      nftMintSignature: "postgres-test-signature",
      crossL1Receipt: {
        ...receipt,
        status: "solana_proof_minted",
        solanaMintAddress: "postgres-test-mint",
      },
    });
    await owner.markTxProcessed(txId);

    // Persist an ambiguous live outcome and ensure it is never silently cleared.
    const unknownTxId = `shieldgive-postgres-unknown-${runId}`;
    const unknown = await first.getOrCreateDonation({
      txId: unknownTxId,
      amountZEC: 0.125,
      detectedAt: now,
      status: "pending",
      solanaWallet: wallet,
    });
    const unknownReceipt = createCrossL1Receipt({
      sourceTxId: unknownTxId,
      donationId: unknown.id,
      amountZEC: 0.125,
      solanaWallet: wallet,
      createdAt: now,
    });
    assert.equal(await first.markDonationValidated(unknown.id, unknownReceipt, wallet), true);
    assert.equal(await second.claimDonationMint(unknown.id), true);
    await second.updateDonation(unknown.id, { nftMintAddress: "postgres-unknown-mint" });
    await second.updateDonation(unknown.id, {
      status: "mint_unknown",
      error: "test-only uncertain outcome",
      crossL1Receipt: { ...unknownReceipt, status: "mint_outcome_unknown" },
    });

    await Promise.all([first.close(), second.close()]);
    afterRestart = new Storage();
    await afterRestart.initialize();

    const persistedDonor = await afterRestart.findDonorByWallet(wallet);
    const persistedDonation = await afterRestart.findDonationByTxId(txId);
    const persistedUnknown = await afterRestart.findDonationByTxId(unknownTxId);
    assert.equal(persistedDonor?.id, donor.id);
    assert.equal(await afterRestart.getWalletForSession(walletSession.token), wallet);
    assert.equal(await afterRestart.getWalletChallenge(walletChallenge.id), undefined);
    assert.equal(persistedDonation?.status, "minted");
    assert.equal(persistedDonation?.nftMintSignature, "postgres-test-signature");
    assert.equal(persistedUnknown?.status, "mint_unknown");
    assert.equal(persistedUnknown?.nftMintAddress, "postgres-unknown-mint");
    assert.equal(await afterRestart.isTxProcessed(txId), true);
    assert.equal(await afterRestart.getReconciliationRequiredCount() >= 1, true);

    const reconciled = await afterRestart.completeMintReconciliation(
      unknown.id,
      "postgres-unknown-mint",
      "postgres-verified-signature",
    );
    assert.equal(reconciled.status, "minted");
    assert.equal(reconciled.nftMintSignature, "postgres-verified-signature");
    assert.equal(await afterRestart.isTxProcessed(unknownTxId), true);
    assert.equal(await afterRestart.getReconciliationRequiredCount(), 0);

    const campaign = await afterRestart.getCampaign();
    assert.equal(campaign.totalRaisedZEC, 0.5);
    assert.equal(campaign.donationCount >= 2, true);

    console.log("SHIELDGIVE POSTGRES PERSISTENCE + ATOMIC CLAIM: PASS");
    console.log(JSON.stringify({
      donorSurvivedRestart: true,
      donationSurvivedRestart: true,
      processedTxSurvivedRestart: true,
      exactlyOneMintClaim: true,
      uncertainOutcomePreserved: true,
      reconciliationRequired: await afterRestart.getReconciliationRequiredCount(),
    }, null, 2));
  } finally {
    await Promise.allSettled([
      first.close(),
      second.close(),
      afterRestart?.close() ?? Promise.resolve(),
    ]);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
