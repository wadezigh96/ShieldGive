import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { publicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function loadSecretKey(): Uint8Array {
  const raw = process.env.SOLANA_PRIVATE_KEY;
  if (!raw || raw === "mock") fail("SOLANA_PRIVATE_KEY is required for devnet preflight");
  try {
    if (raw.trim().startsWith("[")) {
      const parsed = JSON.parse(raw) as number[];
      if (!Array.isArray(parsed) || parsed.length < 32) fail("SOLANA_PRIVATE_KEY JSON array is invalid");
      return Uint8Array.from(parsed);
    }
    return bs58.decode(raw.trim());
  } catch {
    fail("SOLANA_PRIVATE_KEY could not be decoded");
  }
}

async function rpc(rpcUrl: string, method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) fail(`Solana RPC HTTP ${response.status}`);
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) fail(`Solana RPC error: ${body.error.message || "unknown"}`);
  return body.result;
}

async function main() {
  const network = process.env.SOLANA_NETWORK || "devnet";
  if (network !== "devnet") fail(`SOLANA_NETWORK must be devnet for this preflight, got ${network}`);

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  if (!/devnet/i.test(rpcUrl)) fail("SOLANA_RPC_URL must point to a Devnet endpoint");

  const recipient = process.env.SOLANA_TEST_RECIPIENT;
  if (!recipient) fail("SOLANA_TEST_RECIPIENT is required");
  try {
    publicKey(recipient);
  } catch {
    fail("SOLANA_TEST_RECIPIENT is not a valid Solana public key");
  }

  const uri = process.env.SOLANA_NFT_METADATA_URI;
  if (!uri) fail("SOLANA_NFT_METADATA_URI is required");
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:") fail("SOLANA_NFT_METADATA_URI must use HTTPS");
  } catch {
    fail("SOLANA_NFT_METADATA_URI is not a valid URL");
  }

  const secretKey = loadSecretKey();
  const umi = createUmi(rpcUrl);
  const authority = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const health = await rpc(rpcUrl, "getHealth");
  const balance = await rpc(rpcUrl, "getBalance", [authority.publicKey.toString(), { commitment: "confirmed" }]) as { value?: number };

  console.log("PASS: Solana Devnet preflight");
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Health: ${String(health)}`);
  console.log(`Mint authority: ${authority.publicKey.toString()}`);
  console.log(`Recipient: ${recipient}`);
  console.log(`Balance (SOL): ${((balance.value || 0) / 1_000_000_000).toFixed(6)}`);
  console.log("Broadcast: NOT PERFORMED");
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
