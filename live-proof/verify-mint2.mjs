import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const sigB64 = "33zw9HUaM_h1TgB8b4gtr3EbrSqKQqNhj1bCqNboVZrviNPRvcysr5LzRcV-O1e8b3h86A_GH-CicqFgjs0MBw";
const sigB58 = bs58.encode(Buffer.from(sigB64, "base64url"));
console.log("signature (base58):", sigB58);
const tx = await conn.getTransaction(sigB58, { maxSupportedTransactionVersion: 0 });
console.log("tx slot:", tx?.slot, "err:", JSON.stringify(tx?.meta?.err), "fee lamports:", tx?.meta?.fee);
const mint = new PublicKey("GNnfvesCJUn24Wzwek6ndTpUfuN1DNZYG8hn35reBiWA");
const META_PROG = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from("metadata"), META_PROG.toBuffer(), mint.toBuffer()], META_PROG);
console.log("metadata PDA:", pda.toBase58());
const acc = await conn.getAccountInfo(pda);
console.log("metadata account exists:", !!acc, "owner:", acc?.owner.toBase58(), "len:", acc?.data.length);
