import assert from "node:assert/strict";
import { createServer } from "node:http";

const campaignAddress = "zs1shieldgive-regtest-campaign";
const donorWallet = "So11111111111111111111111111111111111111112";
const txId = "regtest-mock-rpc-zcash-tx-001";
process.env.ZCASH_MODE = "live";
process.env.ZCASH_RPC_USER = "test";
process.env.ZCASH_RPC_PASSWORD = "test";
process.env.CAMPAIGN_SHIELDED_ADDRESS = campaignAddress;
process.env.ZCASH_MIN_CONFIRMATIONS = "1";
process.env.SOLANA_MODE = "mock";
process.env.SOLANA_PRIVATE_KEY = "mock";

const { storage } = await import("../src/services/storage.js");
const donor = storage.registerDonor(donorWallet, "mock RPC donor");
const memo = donor.paymentMemo;
const memoHex = Buffer.from(memo, "utf8").toString("hex");

const rpcServer = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    const request = JSON.parse(body);
    assert.equal(request.method, "z_listreceivedbyaddress");
    assert.deepEqual(request.params, [campaignAddress, 1]);

    const payload = {
      jsonrpc: "1.0",
      id: request.id,
      result: [{
        pool: "sapling",
        txid: txId,
        amount: 0.25,
        amountZat: 25_000_000,
        memo: memoHex,
        confirmations: 2,
        blockheight: 100,
        blocktime: Math.floor(Date.now() / 1000),
      }],
    };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
});

await new Promise<void>((resolve) => rpcServer.listen(0, "127.0.0.1", resolve));
const address = rpcServer.address();
assert.ok(address && typeof address === "object");
process.env.ZCASH_RPC_URL = `http://127.0.0.1:${address.port}`;

try {
  const { zcashWatcher } = await import("../src/services/zcashWatcher.js");
  const { processIncomingTx } = await import("../src/agent/pipeline.js");

  assert.equal(donor.paymentMemo, memo);

  const received = await zcashWatcher.pollIncoming();
  assert.equal(received.length, 1);
  assert.equal(received[0].txId, txId);
  assert.equal(received[0].amountZEC, 0.25);
  assert.equal(received[0].memo, memo);

  await processIncomingTx(received[0]);

  const donation = storage.getDonations()[0];
  assert.equal(donation.status, "minted");
  assert.equal(donation.solanaWallet, donorWallet);
  assert.ok(donation.nftMintAddress?.startsWith("mint_"));
  assert.equal(donation.crossL1Receipt?.status, "solana_proof_minted");
  assert.equal(donation.crossL1Receipt?.sourceTxId, txId);
  assert.equal(donation.crossL1Receipt?.destinationChain, "solana");
  assert.equal(storage.getCampaign().totalRaisedZEC, 0.25);

  console.log("SHIELDGIVE MOCK RPC E2E: PASS");
  console.log(JSON.stringify({
    txId,
    amountZEC: donation.amountZEC,
    donationStatus: donation.status,
    receiptStatus: donation.crossL1Receipt?.status,
    mintAddress: donation.nftMintAddress,
  }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => rpcServer.close((err) => err ? reject(err) : resolve()));
}
