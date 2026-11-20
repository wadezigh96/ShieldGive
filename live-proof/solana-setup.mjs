// One-off setup for the ShieldGive LIVE proof (Solana devnet, throwaway keys).
// Generates minter + donor keypairs, writes the minter SECRET into
// backend/.env ONLY (gitignored, never printed), saves PUBLIC addresses to
// solana-keypairs-public.json, and airdrops 2 devnet SOL to the minter.
// Run: node solana-setup.mjs
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const ENV_PATH = path.join(REPO, 'backend', '.env');
const RPC = 'https://api.devnet.solana.com';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function airdropWithRetry(conn, pubkey, lamports, tries = 6) {
  for (let i = 1; i <= tries; i++) {
    try {
      const sig = await conn.requestAirdrop(pubkey, lamports);
      await conn.confirmTransaction(sig, 'confirmed');
      return sig;
    } catch (e) {
      console.log(`airdrop attempt ${i} failed: ${e.message}`);
      if (i === tries) throw e;
      await sleep(15000 * i);
    }
  }
}

const conn = new Connection(RPC, 'confirmed');
console.log('devnet slot:', await conn.getSlot());

const minter = Keypair.generate();
const donor = Keypair.generate();
console.log('minter:', minter.publicKey.toBase58());
console.log('donor :', donor.publicKey.toBase58());

// Write secret into backend/.env (gitignored) without ever printing it.
let env = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
env = env.split('\n').filter((l) => !l.startsWith('SOLANA_PRIVATE_KEY=')).join('\n');
if (!env.endsWith('\n') && env.length > 0) env += '\n';
env += `SOLANA_PRIVATE_KEY=${JSON.stringify(Array.from(minter.secretKey))}\n`;
fs.writeFileSync(ENV_PATH, env);
console.log('minter secret written to backend/.env (not printed)');

fs.writeFileSync(
  path.join(__dirname, 'solana-keypairs-public.json'),
  JSON.stringify(
    {
      network: 'solana-devnet',
      rpc: RPC,
      minter: minter.publicKey.toBase58(),
      donor: donor.publicKey.toBase58(),
      note: 'Throwaway devnet-only keypairs for the ShieldGive live proof. No mainnet value. Private keys are NOT stored here.',
    },
    null,
    2
  )
);

const sig = await airdropWithRetry(conn, minter.publicKey, 2 * LAMPORTS_PER_SOL);
console.log('airdrop sig:', sig);
await sleep(3000);
console.log('minter balance (SOL):', (await conn.getBalance(minter.publicKey)) / LAMPORTS_PER_SOL);
console.log('donor balance (SOL):', (await conn.getBalance(donor.publicKey)) / LAMPORTS_PER_SOL);
console.log('DONE');
