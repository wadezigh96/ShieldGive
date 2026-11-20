import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const sigB64 = "XiShB0ObGD4izpxUD3k6nEGlvzQ2iF14cJmPK9vRThn5NiOGWJUxVVpF-IFKiW7o79OkQytsU8rcEfKMnHGDDg";
const sigB58 = bs58.encode(Buffer.from(sigB64, "base64url"));
console.log("signature (base58):", sigB58);
const tx = await conn.getTransaction(sigB58, { maxSupportedTransactionVersion: 0 });
console.log("tx slot:", tx?.slot, "err:", JSON.stringify(tx?.meta?.err), "fee lamports:", tx?.meta?.fee);
const mint = new PublicKey("66KtaV5A8WxhDekkpcaK4MCNBZS52uM5KrnWWApTnDTJ");
const META_PROG = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const [pda] = PublicKey.findProgramAddressSync(
  [Buffer.from("metadata"), META_PROG.toBuffer(), mint.toBuffer()], META_PROG);
console.log("metadata PDA:", pda.toBase58());
const acc = await conn.getAccountInfo(pda);
console.log("metadata account exists:", !!acc, "owner:", acc?.owner.toBase58(), "len:", acc?.data.length);
