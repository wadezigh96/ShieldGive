import assert from "node:assert/strict";

process.env.SOLANA_MODE = "mock";
process.env.SOLANA_PRIVATE_KEY = "mock";

const { storage } = await import("../src/services/storage.js");
const { processIncomingTx } = await import("../src/agent/pipeline.js");

const donor = storage.registerDonor(
  "So11111111111111111111111111111111111111112",
  "mock e2e donor"
);

assert.match(donor.paymentMemo, /^ShieldGive donor=/);

const txId = "mock-zcash-tx-e2e-001";
await processIncomingTx({
  txId,
  amountZEC: 0.25,
  memo: donor.paymentMemo,
  confirmations: 3,
  receivedAt: new Date().toISOString(),
});

const donations = storage.getDonations();
assert.equal(donations.length, 1, "expected exactly one donation record");

const donation = donations[0];
assert.equal(donation.txId, txId);
assert.equal(donation.status, "minted");
assert.equal(donation.solanaWallet, donor.solanaWallet);
assert.ok(donation.nftMintAddress?.startsWith("mint_"));

assert.ok(donation.crossL1Receipt);
assert.equal(donation.crossL1Receipt.sourceChain, "zcash");
assert.equal(donation.crossL1Receipt.destinationChain, "solana");
assert.equal(donation.crossL1Receipt.status, "solana_proof_minted");
assert.equal(donation.crossL1Receipt.amountZEC, 0.25);
assert.equal(donation.crossL1Receipt.solanaWallet, donor.solanaWallet);
assert.equal(donation.crossL1Receipt.sourceTxId, txId);

const campaign = storage.getCampaign();
assert.equal(campaign.totalRaisedZEC, 0.25);
assert.equal(campaign.donationCount, 1);
assert.equal(storage.isTxProcessed(txId), true);

const logs = storage.getAgentLogs(20).map((entry) => entry.message);
assert.ok(logs.includes("Cross-L1 donation receipt created"));
assert.ok(logs.includes("NFT minted (mock mode)"));
assert.ok(logs.includes("Donation proof NFT minted & cross-L1 receipt completed"));

console.log("SHIELDGIVE MOCK E2E: PASS");
console.log(JSON.stringify({
  txId,
  amountZEC: donation.amountZEC,
  donationStatus: donation.status,
  receiptStatus: donation.crossL1Receipt.status,
  mintAddress: donation.nftMintAddress,
  totalRaisedZEC: campaign.totalRaisedZEC,
}, null, 2));
