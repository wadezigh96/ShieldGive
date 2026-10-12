import { v4 as uuidv4 } from "uuid";
import { createHash, randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type {
  Campaign,
  DonorRegistration,
  DetectedDonation,
  AgentLogEntry,
  CrossL1DonationReceipt,
} from "../types/index.js";

type StorageMode = "memory" | "postgres";
type DonationInput = Omit<DetectedDonation, "id">;
type DbRow = Record<string, any>;
type WalletChallenge = {
  id: string;
  solanaWallet: string;
  message: string;
  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
};
type WalletSession = { solanaWallet: string; expiresAt: string };

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS shieldgive_campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  shielded_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS shieldgive_donors (
  id TEXT PRIMARY KEY,
  solana_wallet TEXT NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  payment_memo TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS shieldgive_donations (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL UNIQUE,
  amount_zec NUMERIC(20,8) NOT NULL CHECK (amount_zec >= 0),
  detected_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','validated','minting','minted','failed','mint_unknown')),
  solana_wallet TEXT,
  nft_mint_address TEXT,
  nft_mint_signature TEXT,
  cross_l1_receipt JSONB,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shieldgive_donations_status_idx ON shieldgive_donations(status);
CREATE INDEX IF NOT EXISTS shieldgive_donations_detected_at_idx ON shieldgive_donations(detected_at DESC);
CREATE TABLE IF NOT EXISTS shieldgive_processed_transactions (
  tx_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shieldgive_agent_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info','success','warn','error')),
  message TEXT NOT NULL,
  meta JSONB
);
CREATE INDEX IF NOT EXISTS shieldgive_agent_logs_timestamp_idx ON shieldgive_agent_logs(timestamp DESC);
CREATE TABLE IF NOT EXISTS shieldgive_wallet_challenges (
  id TEXT PRIMARY KEY,
  solana_wallet TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS shieldgive_wallet_challenges_expiry_idx ON shieldgive_wallet_challenges(expires_at);
CREATE TABLE IF NOT EXISTS shieldgive_wallet_sessions (
  token_hash TEXT PRIMARY KEY,
  solana_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS shieldgive_wallet_sessions_expiry_idx ON shieldgive_wallet_sessions(expires_at);
`;

function dateString(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function parseReceipt(value: unknown): CrossL1DonationReceipt | undefined {
  if (!value) return undefined;
  return (typeof value === "string" ? JSON.parse(value) : value) as CrossL1DonationReceipt;
}

function donorFromRow(row: DbRow): DonorRegistration {
  return {
    id: String(row.id),
    solanaWallet: String(row.solana_wallet),
    registeredAt: dateString(row.registered_at),
    ...(row.note == null ? {} : { note: String(row.note) }),
    paymentMemo: String(row.payment_memo),
  };
}

function donationFromRow(row: DbRow): DetectedDonation {
  return {
    id: String(row.id),
    txId: String(row.tx_id),
    amountZEC: Number(row.amount_zec),
    detectedAt: dateString(row.detected_at),
    status: row.status as DetectedDonation["status"],
    ...(row.solana_wallet == null ? {} : { solanaWallet: String(row.solana_wallet) }),
    ...(row.nft_mint_address == null ? {} : { nftMintAddress: String(row.nft_mint_address) }),
    ...(row.nft_mint_signature == null ? {} : { nftMintSignature: String(row.nft_mint_signature) }),
    ...(row.cross_l1_receipt == null ? {} : { crossL1Receipt: parseReceipt(row.cross_l1_receipt) }),
    ...(row.error == null ? {} : { error: String(row.error) }),
  };
}

function logFromRow(row: DbRow): AgentLogEntry {
  let meta: Record<string, unknown> | undefined;
  if (row.meta != null) {
    const parsed = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed;
  }
  return {
    id: String(row.id),
    timestamp: dateString(row.timestamp),
    level: row.level as AgentLogEntry["level"],
    message: String(row.message),
    ...(meta ? { meta } : {}),
  };
}

/**
 * PostgreSQL is the durable production store. The in-memory adapter is kept
 * only for local development and deterministic tests. Production fails closed
 * when DATABASE_URL is missing; it never silently falls back to RAM.
 */
export class Storage {
  private initPromise?: Promise<void>;
  private pool?: Pool;
  private mode?: StorageMode;
  private campaign: Campaign = {
    id: "camp_demo_001",
    title: "ShieldGive — Private Contribution Proofs",
    description:
      "Make a private Zcash contribution and associate it with a verifiable Solana proof wallet. ShieldGive separates donor identity from the public proof layer and keeps the contribution workflow privacy-focused.",
    shieldedAddress:
      process.env.CAMPAIGN_SHIELDED_ADDRESS ||
      "zs1demoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    createdAt: new Date().toISOString(),
    totalRaisedZEC: 0,
    donationCount: 0,
  };
  private donors = new Map<string, DonorRegistration>();
  private donations = new Map<string, DetectedDonation>();
  private processedTxIds = new Set<string>();
  private agentLogs: AgentLogEntry[] = [];
  private walletChallenges = new Map<string, WalletChallenge>();
  private walletSessions = new Map<string, WalletSession>();

  initialize(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.initializeInternal();
    return this.initPromise;
  }

  private async initializeInternal(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("DATABASE_URL is required in production; refusing in-memory storage");
      }
      this.mode = "memory";
      return;
    }

    const pool = new Pool({
      connectionString,
      max: Math.max(1, Math.min(10, Number.parseInt(process.env.DB_POOL_MAX || "5", 10) || 5)),
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 30000,
    });
    const schemaLockKey = 73123178371;
    let client: PoolClient | undefined;
    let lockAcquired = false;
    try {
      client = await pool.connect();
      // Serialize schema bootstrap so two instances starting together cannot
      // race while creating the same tables and indexes.
      await client.query("SELECT pg_advisory_lock($1::bigint)", [schemaLockKey]);
      lockAcquired = true;
      await client.query("SELECT 1");
      await client.query(SCHEMA_SQL);
      await client.query(
        `INSERT INTO shieldgive_campaigns (id, title, description, shielded_address, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET shielded_address = EXCLUDED.shielded_address`,
        [
          this.campaign.id,
          this.campaign.title,
          this.campaign.description,
          this.campaign.shieldedAddress,
          this.campaign.createdAt,
        ],
      );
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [schemaLockKey]);
      lockAcquired = false;
      client.release();
      client = undefined;
      this.pool = pool;
      this.mode = "postgres";
    } catch (error) {
      if (client) {
        if (lockAcquired) {
          await client.query("SELECT pg_advisory_unlock($1::bigint)", [schemaLockKey]).catch(() => undefined);
        }
        client.release();
      }
      await pool.end().catch(() => undefined);
      throw new Error(
        `PostgreSQL initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async ready(): Promise<void> {
    await this.initialize();
  }

  async getStorageMode(): Promise<StorageMode> {
    await this.ready();
    return this.mode!;
  }

  async close(): Promise<void> {
    if (this.pool) {
      const pool = this.pool;
      this.pool = undefined;
      await pool.end();
    }
    this.mode = undefined;
    this.initPromise = undefined;
  }

  async getCampaign(): Promise<Campaign> {
    await this.ready();
    if (!this.pool) {
      const minted = Array.from(this.donations.values()).filter((donation) => donation.status === "minted");
      const totalRaisedZEC = Math.round(
        minted.reduce((total, donation) => total + donation.amountZEC, 0) * 1e8,
      ) / 1e8;
      return { ...this.campaign, totalRaisedZEC, donationCount: minted.length };
    }
    const result = await this.pool.query(
      `SELECT c.id, c.title, c.description, c.shielded_address, c.created_at,
              COALESCE(SUM(d.amount_zec) FILTER (WHERE d.status = 'minted'), 0) AS total_raised,
              COUNT(d.id) FILTER (WHERE d.status = 'minted') AS donation_count
       FROM shieldgive_campaigns c
       LEFT JOIN shieldgive_donations d ON TRUE
       WHERE c.id = $1
       GROUP BY c.id`,
      [this.campaign.id],
    );
    const row = result.rows[0];
    if (!row) throw new Error("ShieldGive campaign row is missing");
    return {
      id: String(row.id),
      title: String(row.title),
      description: String(row.description),
      shieldedAddress: String(row.shielded_address),
      createdAt: dateString(row.created_at),
      totalRaisedZEC: Number(row.total_raised),
      donationCount: Number(row.donation_count),
    };
  }

  async registerDonor(solanaWallet: string, note?: string): Promise<DonorRegistration> {
    await this.ready();
    const normalized = solanaWallet.trim();
    if (!normalized) throw new Error("Solana wallet address is required");
    const existing = await this.findDonorByWallet(normalized);
    if (existing) return existing;

    const registration: DonorRegistration = {
      id: uuidv4(),
      solanaWallet: normalized,
      registeredAt: new Date().toISOString(),
      ...(note === undefined ? {} : { note }),
      paymentMemo: "",
    };
    registration.paymentMemo = `ShieldGive donor=${registration.id}`;

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO shieldgive_donors (id, solana_wallet, registered_at, note, payment_memo)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (solana_wallet) DO NOTHING`,
        [registration.id, normalized, registration.registeredAt, note ?? null, registration.paymentMemo],
      );
      const saved = await this.pool.query(
        "SELECT * FROM shieldgive_donors WHERE solana_wallet = $1",
        [normalized],
      );
      if (!saved.rows[0]) throw new Error("Failed to persist donor registration");
      return donorFromRow(saved.rows[0]);
    }

    for (const donor of this.donors.values()) {
      if (donor.solanaWallet === normalized) return donor;
    }
    this.donors.set(registration.id, registration);
    return { ...registration };
  }

  async getDonors(): Promise<DonorRegistration[]> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query("SELECT * FROM shieldgive_donors ORDER BY registered_at DESC");
      return result.rows.map(donorFromRow);
    }
    return Array.from(this.donors.values()).map((donor) => ({ ...donor }));
  }

  async findDonorById(id: string): Promise<DonorRegistration | undefined> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query("SELECT * FROM shieldgive_donors WHERE id = $1", [id]);
      return result.rows[0] ? donorFromRow(result.rows[0]) : undefined;
    }
    const donor = this.donors.get(id);
    return donor ? { ...donor } : undefined;
  }

  async findDonorByWallet(wallet: string): Promise<DonorRegistration | undefined> {
    await this.ready();
    const normalized = wallet.trim();
    if (this.pool) {
      const result = await this.pool.query("SELECT * FROM shieldgive_donors WHERE solana_wallet = $1", [normalized]);
      return result.rows[0] ? donorFromRow(result.rows[0]) : undefined;
    }
    const donor = Array.from(this.donors.values()).find((item) => item.solanaWallet === normalized);
    return donor ? { ...donor } : undefined;
  }

  async getLatestDonor(): Promise<DonorRegistration | undefined> {
    const donors = await this.getDonors();
    return donors[0];
  }

  async getDonationsByWallet(wallet: string): Promise<DetectedDonation[]> {
    await this.ready();
    const normalized = wallet.trim();
    if (this.pool) {
      const result = await this.pool.query(
        "SELECT * FROM shieldgive_donations WHERE solana_wallet = $1 ORDER BY detected_at DESC, id DESC",
        [normalized],
      );
      return result.rows.map(donationFromRow);
    }
    return Array.from(this.donations.values())
      .filter((donation) => donation.solanaWallet === normalized)
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .map((donation) => ({ ...donation }));
  }

  async createWalletChallenge(solanaWallet: string): Promise<WalletChallenge> {
    await this.ready();
    const id = uuidv4();
    const nonce = randomBytes(32).toString("base64url");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
    const message = [
      "ShieldGive private donation access",
      "Purpose: Verify wallet ownership for private donation status and registration. This will not send a transaction.",
      `Wallet: ${solanaWallet}`,
      `Challenge ID: ${id}`,
      `Nonce: ${nonce}`,
      `Issued At: ${createdAt.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
    ].join("\n");
    const challenge: WalletChallenge = {
      id,
      solanaWallet,
      message,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    if (this.pool) {
      await this.pool.query(
        "DELETE FROM shieldgive_wallet_challenges WHERE expires_at < NOW() OR consumed_at IS NOT NULL",
      );
      await this.pool.query(
        `INSERT INTO shieldgive_wallet_challenges
          (id, solana_wallet, message, created_at, expires_at, consumed_at)
         VALUES ($1, $2, $3, $4, $5, NULL)`,
        [id, solanaWallet, message, challenge.createdAt, challenge.expiresAt],
      );
    } else {
      for (const [key, value] of this.walletChallenges) {
        if (value.consumedAt || new Date(value.expiresAt).getTime() <= createdAt.getTime()) {
          this.walletChallenges.delete(key);
        }
      }
      this.walletChallenges.set(id, challenge);
    }
    return challenge;
  }

  async getWalletChallenge(id: string): Promise<WalletChallenge | undefined> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT id, solana_wallet, message, created_at, expires_at, consumed_at
         FROM shieldgive_wallet_challenges
         WHERE id = $1 AND consumed_at IS NULL AND expires_at > NOW()`,
        [id],
      );
      const row = result.rows[0];
      return row ? {
        id: String(row.id),
        solanaWallet: String(row.solana_wallet),
        message: String(row.message),
        createdAt: dateString(row.created_at),
        expiresAt: dateString(row.expires_at),
      } : undefined;
    }
    const challenge = this.walletChallenges.get(id);
    if (!challenge || challenge.consumedAt || new Date(challenge.expiresAt).getTime() <= Date.now()) {
      return undefined;
    }
    return { ...challenge };
  }

  async consumeWalletChallenge(id: string, wallet: string, message: string): Promise<boolean> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE shieldgive_wallet_challenges SET consumed_at = NOW()
         WHERE id = $1 AND solana_wallet = $2 AND message = $3
           AND consumed_at IS NULL AND expires_at > NOW()
         RETURNING id`,
        [id, wallet, message],
      );
      return (result.rowCount ?? 0) > 0;
    }
    const challenge = this.walletChallenges.get(id);
    if (!challenge || challenge.consumedAt || challenge.solanaWallet !== wallet ||
        challenge.message !== message || new Date(challenge.expiresAt).getTime() <= Date.now()) {
      return false;
    }
    challenge.consumedAt = new Date().toISOString();
    this.walletChallenges.set(id, challenge);
    return true;
  }

  async createWalletSession(wallet: string): Promise<{ token: string; expiresAt: string }> {
    await this.ready();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);
    if (this.pool) {
      await this.pool.query("DELETE FROM shieldgive_wallet_sessions WHERE expires_at < NOW()");
      await this.pool.query(
        "INSERT INTO shieldgive_wallet_sessions (token_hash, solana_wallet, created_at, expires_at) VALUES ($1, $2, $3, $4)",
        [tokenHash, wallet, createdAt.toISOString(), expiresAt.toISOString()],
      );
    } else {
      for (const [key, session] of this.walletSessions) {
        if (new Date(session.expiresAt).getTime() <= createdAt.getTime()) this.walletSessions.delete(key);
      }
      this.walletSessions.set(tokenHash, { solanaWallet: wallet, expiresAt: expiresAt.toISOString() });
    }
    return { token, expiresAt: expiresAt.toISOString() };
  }

  async getWalletForSession(token: string): Promise<string | undefined> {
    await this.ready();
    if (!token || token.length < 30 || token.length > 200) return undefined;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    if (this.pool) {
      const result = await this.pool.query(
        "SELECT solana_wallet FROM shieldgive_wallet_sessions WHERE token_hash = $1 AND expires_at > NOW()",
        [tokenHash],
      );
      return result.rows[0] ? String(result.rows[0].solana_wallet) : undefined;
    }
    const session = this.walletSessions.get(tokenHash);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return undefined;
    return session.solanaWallet;
  }

  async isTxProcessed(txId: string): Promise<boolean> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query(
        "SELECT 1 FROM shieldgive_processed_transactions WHERE tx_id = $1",
        [txId],
      );
      return (result.rowCount ?? 0) > 0;
    }
    return this.processedTxIds.has(txId);
  }

  async markTxProcessed(txId: string): Promise<void> {
    await this.ready();
    if (this.pool) {
      await this.pool.query(
        "INSERT INTO shieldgive_processed_transactions (tx_id) VALUES ($1) ON CONFLICT (tx_id) DO NOTHING",
        [txId],
      );
      return;
    }
    this.processedTxIds.add(txId);
  }

  async getOrCreateDonation(donation: DonationInput): Promise<DetectedDonation> {
    await this.ready();
    if (this.pool) {
      const id = uuidv4();
      await this.pool.query(
        `INSERT INTO shieldgive_donations
           (id, tx_id, amount_zec, detected_at, status, solana_wallet, nft_mint_address,
            nft_mint_signature, cross_l1_receipt, error, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW())
         ON CONFLICT (tx_id) DO NOTHING`,
        [
          id, donation.txId, donation.amountZEC, donation.detectedAt, donation.status,
          donation.solanaWallet ?? null, donation.nftMintAddress ?? null,
          donation.nftMintSignature ?? null,
          donation.crossL1Receipt ? JSON.stringify(donation.crossL1Receipt) : null,
          donation.error ?? null,
        ],
      );
      const saved = await this.pool.query("SELECT * FROM shieldgive_donations WHERE tx_id = $1", [donation.txId]);
      if (!saved.rows[0]) throw new Error("Failed to load persisted donation");
      return donationFromRow(saved.rows[0]);
    }

    const existing = Array.from(this.donations.values()).find((item) => item.txId === donation.txId);
    if (existing) return { ...existing };
    const full: DetectedDonation = { id: uuidv4(), ...donation };
    this.donations.set(full.id, full);
    return { ...full };
  }

  async addDonation(donation: DonationInput): Promise<DetectedDonation> {
    return this.getOrCreateDonation(donation);
  }

  async findDonationByTxId(txId: string): Promise<DetectedDonation | undefined> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query("SELECT * FROM shieldgive_donations WHERE tx_id = $1", [txId]);
      return result.rows[0] ? donationFromRow(result.rows[0]) : undefined;
    }
    const donation = Array.from(this.donations.values()).find((item) => item.txId === txId);
    return donation ? { ...donation } : undefined;
  }

  async updateDonation(id: string, patch: Partial<DetectedDonation>): Promise<DetectedDonation | null> {
    await this.ready();
    const existing = this.pool
      ? await this.findDonationById(id)
      : this.donations.get(id);
    if (!existing) return null;
    const updated: DetectedDonation = { ...existing, ...patch };
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE shieldgive_donations
         SET amount_zec = $2, detected_at = $3, status = $4, solana_wallet = $5,
             nft_mint_address = $6, nft_mint_signature = $7, cross_l1_receipt = $8::jsonb,
             error = $9, updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id, updated.amountZEC, updated.detectedAt, updated.status,
          updated.solanaWallet ?? null, updated.nftMintAddress ?? null,
          updated.nftMintSignature ?? null,
          updated.crossL1Receipt ? JSON.stringify(updated.crossL1Receipt) : null,
          updated.error ?? null,
        ],
      );
      return result.rows[0] ? donationFromRow(result.rows[0]) : null;
    }
    this.donations.set(id, updated);
    return { ...updated };
  }

  async findDonationById(id: string): Promise<DetectedDonation | undefined> {
    await this.ready();
    if (!this.pool) {
      const donation = this.donations.get(id);
      return donation ? { ...donation } : undefined;
    }
    const result = await this.pool.query("SELECT * FROM shieldgive_donations WHERE id = $1", [id]);
    return result.rows[0] ? donationFromRow(result.rows[0]) : undefined;
  }

  /**
   * Finalize a mint only after a separate on-chain verifier has checked the
   * confirmed transaction, NFT mint account, and recipient token balance.
   * The status transition and processed-tx marker commit together.
   */
  async completeMintReconciliation(
    id: string,
    mintAddress: string,
    signature: string,
  ): Promise<DetectedDonation> {
    await this.ready();
    if (!mintAddress.trim() || !signature.trim()) {
      throw new Error("Mint address and confirmed Solana signature are required");
    }

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const selected = await client.query(
          "SELECT * FROM shieldgive_donations WHERE id = $1 FOR UPDATE",
          [id],
        );
        if (!selected.rows[0]) throw new Error("Donation not found");
        const existing = donationFromRow(selected.rows[0]);
        if (existing.status === "minted") {
          if (existing.nftMintAddress !== mintAddress || existing.nftMintSignature !== signature) {
            throw new Error("Donation is already minted with a different address or signature");
          }
          await client.query(
            "INSERT INTO shieldgive_processed_transactions (tx_id) VALUES ($1) ON CONFLICT (tx_id) DO NOTHING",
            [existing.txId],
          );
          await client.query("COMMIT");
          return existing;
        }
        if (existing.status !== "mint_unknown" && existing.status !== "minting") {
          throw new Error(`Donation status ${existing.status} is not eligible for mint reconciliation`);
        }
        if (existing.nftMintAddress && existing.nftMintAddress !== mintAddress) {
          throw new Error("Mint address does not match the candidate persisted before broadcast");
        }
        const receipt = existing.crossL1Receipt
          ? { ...existing.crossL1Receipt, status: "solana_proof_minted" as const, solanaMintAddress: mintAddress }
          : undefined;
        const updated = await client.query(
          `UPDATE shieldgive_donations
           SET status = 'minted', nft_mint_address = $2, nft_mint_signature = $3,
               cross_l1_receipt = $4::jsonb, error = NULL, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [id, mintAddress, signature, receipt ? JSON.stringify(receipt) : null],
        );
        await client.query(
          "INSERT INTO shieldgive_processed_transactions (tx_id) VALUES ($1) ON CONFLICT (tx_id) DO NOTHING",
          [existing.txId],
        );
        await client.query("COMMIT");
        return donationFromRow(updated.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }

    const existing = this.donations.get(id);
    if (!existing) throw new Error("Donation not found");
    if (existing.status === "minted") {
      if (existing.nftMintAddress !== mintAddress || existing.nftMintSignature !== signature) {
        throw new Error("Donation is already minted with a different address or signature");
      }
      this.processedTxIds.add(existing.txId);
      return { ...existing };
    }
    if (existing.status !== "mint_unknown" && existing.status !== "minting") {
      throw new Error(`Donation status ${existing.status} is not eligible for mint reconciliation`);
    }
    if (existing.nftMintAddress && existing.nftMintAddress !== mintAddress) {
      throw new Error("Mint address does not match the candidate persisted before broadcast");
    }
    const updated: DetectedDonation = {
      ...existing,
      status: "minted",
      nftMintAddress: mintAddress,
      nftMintSignature: signature,
      crossL1Receipt: existing.crossL1Receipt
        ? { ...existing.crossL1Receipt, status: "solana_proof_minted", solanaMintAddress: mintAddress }
        : undefined,
      error: undefined,
    };
    this.donations.set(id, updated);
    this.processedTxIds.add(existing.txId);
    return { ...updated };
  }

  /**
   * Atomically prepare a row for minting without overwriting a claim owned by
   * another process. A row already in validated state is ready for claim.
   */
  async markDonationValidated(id: string, receipt: CrossL1DonationReceipt, solanaWallet: string): Promise<boolean> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE shieldgive_donations
         SET status = 'validated', solana_wallet = $2, cross_l1_receipt = $3::jsonb,
             error = NULL, updated_at = NOW()
         WHERE id = $1 AND status IN ('pending','failed')
         RETURNING id`,
        [id, solanaWallet, JSON.stringify(receipt)],
      );
      if ((result.rowCount ?? 0) > 0) return true;
      const current = await this.pool.query("SELECT status FROM shieldgive_donations WHERE id = $1", [id]);
      return current.rows[0]?.status === "validated";
    }
    const current = this.donations.get(id);
    if (!current) return false;
    if (current.status === "validated") return true;
    if (current.status !== "pending" && current.status !== "failed") return false;
    this.donations.set(id, {
      ...current,
      status: "validated",
      solanaWallet,
      crossL1Receipt: receipt,
      error: undefined,
    });
    return true;
  }

  /** A conditional database update is the cross-process mint claim. */
  async claimDonationMint(id: string): Promise<boolean> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query(
        `UPDATE shieldgive_donations SET status = 'minting', updated_at = NOW()
         WHERE id = $1 AND status = 'validated' RETURNING id`,
        [id],
      );
      return (result.rowCount ?? 0) > 0;
    }
    const current = this.donations.get(id);
    if (!current || current.status !== "validated") return false;
    this.donations.set(id, { ...current, status: "minting" });
    return true;
  }

  async getDonations(): Promise<DetectedDonation[]> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query(
        "SELECT * FROM shieldgive_donations ORDER BY detected_at DESC, id DESC",
      );
      return result.rows.map(donationFromRow);
    }
    return Array.from(this.donations.values())
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .map((donation) => ({ ...donation }));
  }

  async getReconciliationRequiredCount(): Promise<number> {
    await this.ready();
    if (this.pool) {
      const result = await this.pool.query(
        "SELECT COUNT(*) AS count FROM shieldgive_donations WHERE status IN ('minting','mint_unknown')",
      );
      return Number(result.rows[0]?.count || 0);
    }
    return Array.from(this.donations.values()).filter(
      (donation) => donation.status === "minting" || donation.status === "mint_unknown",
    ).length;
  }

  async addAgentLog(
    level: AgentLogEntry["level"],
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<AgentLogEntry> {
    await this.ready();
    const entry: AgentLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta === undefined ? {} : { meta }),
    };
    if (this.pool) {
      const result = await this.pool.query(
        `INSERT INTO shieldgive_agent_logs (id, timestamp, level, message, meta)
         VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
        [entry.id, entry.timestamp, entry.level, entry.message, meta === undefined ? null : JSON.stringify(meta)],
      );
      return logFromRow(result.rows[0]);
    }
    this.agentLogs.unshift(entry);
    if (this.agentLogs.length > 200) this.agentLogs = this.agentLogs.slice(0, 200);
    return { ...entry };
  }

  async getAgentLogs(limit = 50): Promise<AgentLogEntry[]> {
    await this.ready();
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit) || 50));
    if (this.pool) {
      const result = await this.pool.query(
        "SELECT * FROM shieldgive_agent_logs ORDER BY timestamp DESC LIMIT $1",
        [safeLimit],
      );
      return result.rows.map(logFromRow);
    }
    return this.agentLogs.slice(0, safeLimit).map((entry) => ({ ...entry }));
  }
}

export const storage = new Storage();
