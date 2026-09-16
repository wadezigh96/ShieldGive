const state = globalThis.__shieldGiveState || {
  campaign: {
    id: "camp_demo_001",
    title: "Support Privacy Research",
    description:
      "Help fund independent research into zero-knowledge proofs and private public goods. All donations are shielded — your identity stays private while you still receive a collectible NFT proof on Solana.",
    shieldedAddress:
      process.env.CAMPAIGN_SHIELDED_ADDRESS ||
      "zs1demoaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    createdAt: new Date().toISOString(),
    totalRaisedZEC: 0,
    donationCount: 0,
  },
  donors: [],
  donations: [],
  logs: [],
};

globalThis.__shieldGiveState = state;

function json(res, status, body) {
  res.status(status).json(body);
}

function id() {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return req.body ? JSON.parse(req.body) : {};
  } catch {
    return null;
  }
}

function addLog(level, message, meta) {
  state.logs.unshift({ id: id(), timestamp: new Date().toISOString(), level, message, meta });
  state.logs = state.logs.slice(0, 200);
}

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path)
    ? req.query.path.join("/")
    : String(req.query.path || "");
  const method = req.method || "GET";

  if (method === "GET" && path === "campaign") {
    return json(res, 200, { success: true, data: { ...state.campaign } });
  }

  if (method === "GET" && path === "donors") {
    return json(res, 200, { success: true, data: state.donors });
  }

  if (method === "GET" && path === "donations") {
    return json(res, 200, { success: true, data: state.donations });
  }

  if (method === "GET" && path === "agent/logs") {
    const requested = Number.parseInt(String(req.query.limit || "40"), 10);
    const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, requested)) : 40;
    return json(res, 200, { success: true, data: state.logs.slice(0, limit) });
  }

  if (method === "GET" && path === "agent/status") {
    return json(res, 200, {
      success: true,
      data: {
        mockZcash: true,
        mockSolana: true,
        pollIntervalSeconds: 30,
        totalDonations: state.donations.length,
        registeredDonors: state.donors.length,
      },
    });
  }

  if (method === "POST" && path === "register") {
    const body = bodyOf(req);
    const wallet = typeof body?.solanaWallet === "string" ? body.solanaWallet.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : undefined;
    if (wallet.length < 32 || wallet.length > 64) {
      return json(res, 400, { success: false, error: { message: "A valid Solana wallet address is required" } });
    }
    if (note && note.length > 200) {
      return json(res, 400, { success: false, error: { message: "Note must be 200 characters or fewer" } });
    }

    const existing = state.donors.find((donor) => donor.solanaWallet === wallet);
    if (existing) return json(res, 201, { success: true, data: existing });

    const registration = { id: id(), solanaWallet: wallet, registeredAt: new Date().toISOString(), note };
    state.donors.push(registration);
    addLog("info", "Donor wallet registered", { solanaWallet: wallet });
    return json(res, 201, { success: true, data: registration });
  }

  if (method === "POST" && path === "agent/simulate") {
    const body = bodyOf(req);
    const amount = Number(body?.amountZEC);
    const memo = typeof body?.memo === "string" ? body.memo.trim() : undefined;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
      return json(res, 400, { success: false, error: { message: "Amount must be between 0 and 1000 ZEC" } });
    }
    if (memo && memo.length > 200) {
      return json(res, 400, { success: false, error: { message: "Memo must be 200 characters or fewer" } });
    }

    const txId = `demo-${id()}`;
    const donation = {
      id: id(),
      txId,
      amountZEC: amount,
      detectedAt: new Date().toISOString(),
      status: "minted",
      solanaWallet: state.donors.at(-1)?.solanaWallet,
      nftMintAddress: `DemoMint${id().replaceAll("-", "").slice(0, 28)}`,
    };
    state.donations.unshift(donation);
    state.campaign.totalRaisedZEC = Math.round((state.campaign.totalRaisedZEC + amount) * 1e8) / 1e8;
    state.campaign.donationCount += 1;
    addLog("success", "Shielded donation processed and NFT minted", { txId, amountZEC: amount, memo });
    return json(res, 201, { success: true, data: { txId, amountZEC: amount, message: "Simulated donation processed through the agent pipeline" } });
  }

  return json(res, 404, { success: false, error: { message: "API route not found" } });
}
