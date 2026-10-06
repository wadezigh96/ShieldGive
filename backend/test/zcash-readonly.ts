import assert from "node:assert/strict";
import { ZcashWatcher } from "../src/services/zcashWatcher.js";

(async () => {

for (const key of ["ZCASH_RPC_URL", "CAMPAIGN_SHIELDED_ADDRESS", "ZCASH_TEST_TXID"]) {
  if (!process.env[key]) {
    throw new Error(`${key} is required for the read-only Zcash smoke test`);
  }
}

const expectedMemo = process.env.ZCASH_TEST_MEMO;
const watcher = new ZcashWatcher();
assert.equal(watcher.isMockMode(), false, "Zcash watcher must be in live mode");

const received = await watcher.pollIncoming();
const target = received.find((tx) => tx.txId === process.env.ZCASH_TEST_TXID);

assert.ok(target, "target Zcash transaction was not detected");
assert.ok(target.amountZEC > 0, "target transaction amount must be positive");

if (expectedMemo) {
  assert.equal(target.memo, expectedMemo, "target memo does not match");
}

console.log("SHIELDGIVE ZCASH READ-ONLY SMOKE: PASS");
console.log(JSON.stringify({
  txId: target.txId,
  amountZEC: target.amountZEC,
  confirmations: "satisfied by watcher min-confirmation policy",
  memoMatched: expectedMemo ? target.memo === expectedMemo : null,
}, null, 2));

})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
