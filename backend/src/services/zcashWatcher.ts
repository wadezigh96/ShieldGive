import { storage } from "./storage.js";

export interface IncomingShieldedTx {
  txId: string;
  amountZEC: number;
  blockHeight?: number;
  memo?: string;
  receivedAt: string;
}

interface ZcashReceivedRecord {
  pool?: string;
  txid: string;
  amount?: number;
  amountZat?: number;
  memo?: string;
  memoStr?: string;
  confirmations?: number;
  blockheight?: number;
  blocktime?: number;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code?: number; message?: string };
}

async function zcashRpc<T>(method: string, params: unknown[]): Promise<T> {
  const url = process.env.ZCASH_RPC_URL;
  if (!url) throw new Error("ZCASH_RPC_URL is not configured");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.ZCASH_RPC_USER || process.env.ZCASH_RPC_PASSWORD) {
    const user = process.env.ZCASH_RPC_USER || "";
    const password = process.env.ZCASH_RPC_PASSWORD || "";
    headers.authorization = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "1.0", id: "shieldgive", method, params }),
  });

  if (!response.ok) throw new Error(`Zcash RPC HTTP ${response.status}`);
  const body = (await response.json()) as JsonRpcResponse<T>;
  if (body.error) throw new Error(body.error.message || "Zcash RPC error");
  return body.result as T;
}

function decodeMemo(record: ZcashReceivedRecord): string | undefined {
  if (record.memoStr) return record.memoStr;
  if (!record.memo) return undefined;
  try {
    return Buffer.from(record.memo, "hex").toString("utf8").replace(/\0+$/g, "");
  } catch {
    return undefined;
  }
}

export class ZcashWatcher {
  private mockMode: boolean;

  constructor() {
    this.mockMode =
      process.env.ZCASH_MODE === "mock" ||
      !process.env.ZCASH_RPC_URL ||
      !process.env.CAMPAIGN_SHIELDED_ADDRESS ||
      process.env.CAMPAIGN_SHIELDED_ADDRESS.startsWith("zs1demo");
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  async pollIncoming(): Promise<IncomingShieldedTx[]> {
    if (this.mockMode) return [];

    const address = process.env.CAMPAIGN_SHIELDED_ADDRESS!;
    const minconf = Math.max(1, parseInt(process.env.ZCASH_MIN_CONFIRMATIONS || "1", 10));

    // z_listreceivedbyaddress is the supported legacy Sapling RPC for
    // wallet-tracked shielded addresses. The node must have the viewing key
    // imported; the backend never receives a spending key.
    const method = process.env.ZCASH_RPC_METHOD || "z_listreceivedbyaddress";
    let params: unknown[];
    if (process.env.ZCASH_RPC_PARAMS) {
      try {
        const parsed = JSON.parse(process.env.ZCASH_RPC_PARAMS);
        if (!Array.isArray(parsed)) throw new Error("ZCASH_RPC_PARAMS must be a JSON array");
        params = parsed;
      } catch (err) {
        throw new Error(
          `Invalid ZCASH_RPC_PARAMS: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else if (method === "z_listreceivedbyaddress") {
      params = [address, minconf];
    } else {
      // For Zallet/zcashd variants, pass the exact RPC parameters through
      // ZCASH_RPC_PARAMS rather than guessing version-specific argument order.
      params = [];
    }
    const records = await zcashRpc<ZcashReceivedRecord[]>(method, params);

    return records
      .filter((record) => {
        const amount = Number(record.amount ?? 0);
        const recordAddress = (record as any).address as string | undefined;
        const confirmations = Number((record as any).confirmations ?? 0);
        return record.txid && amount > 0 && confirmations >= minconf &&
          (!recordAddress || recordAddress === address);
      })
      .map((record) => ({
        txId: record.txid,
        amountZEC: Number(record.amount ?? Number(record.amountZat || 0) / 100_000_000),
        blockHeight: record.blockheight,
        memo: decodeMemo(record),
        receivedAt: record.blocktime
          ? new Date(record.blocktime * 1000).toISOString()
          : new Date().toISOString(),
      }));
  }

  async simulateIncomingDonation(
    amountZEC: number,
    options?: { txId?: string; memo?: string }
  ): Promise<IncomingShieldedTx> {
    const tx: IncomingShieldedTx = {
      txId: options?.txId || `mock_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amountZEC,
      receivedAt: new Date().toISOString(),
      memo: options?.memo || "ShieldGive donation",
    };

    storage.addAgentLog("info", "Simulated shielded donation injected", {
      txId: tx.txId,
      amountZEC: tx.amountZEC,
    });

    return tx;
  }
}

export const zcashWatcher = new ZcashWatcher();
