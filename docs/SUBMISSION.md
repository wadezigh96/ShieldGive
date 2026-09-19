# ShieldGive — Colosseum Crypto World's Fair Submission Pack

**Submission draft — verify portal deadline/track details before final submission**

---

## 1. Product Name
```
ShieldGive
```

## 2. Short Description (≤ 50 words recommended)
```
ShieldGive demonstrates private donations via Zcash shielded transactions with a Solana contribution-proof layer. The public demo uses deterministic mock detection and proof creation, while the architecture is prepared for live Zcash monitoring and Solana minting.
```

## 3. Longer Product Description (for portal / pitch)
```
On-chain donations permanently expose donor identity and amounts. Privacy-conscious supporters of sensitive causes therefore often stay silent or receive no collectible proof.

ShieldGive solves this with a simple, automated pipeline:

1. Donor registers a Solana wallet once.
2. Donor registers a Solana proof wallet and the campaign provides a shielded Zcash address.
3. The background agent is designed to detect payments through a Zcash viewing-key integration; the public demo uses deterministic local simulation.
4. The validated contribution becomes a proof record; live Solana NFT minting is a separate production configuration.
5. The public gallery shows total raised without revealing any donor identities.

The “agent” is not an LLM — it is a reliable, low-complexity background worker that runs the fixed sequence: poll → validate → mint. This keeps the system trustworthy while still demonstrating autonomous execution for judges.
```

## 4. Blockchains & Tools
```
- Zcash: Shielded-transaction UX and a planned viewing-key watcher; public demo currently supports mock detection
- Solana: NFT proof flow with mock mint in the public demo; Metaplex/UMI is the intended live mint integration
- Backend: Node.js + TypeScript + node-cron (agent)
- Frontend: React + Vite + Tailwind
```

## 5. GitHub Repository
```
https://github.com/wadezigh96/ShieldGive
```
(If the repo is private, grant access to `hackathon@colosseum.com`)

## 6. Live Product / Demo URL
```
Live demo URL: https://shield-give.vercel.app/
```
**How judges can test:**
1. Open the Campaign page → connect Privy and register a Solana wallet.
2. Go to the Agent Dashboard → enter an amount (e.g. 0.25) → click “Run agent pipeline”.
3. Watch the activity log: correlation → validation → demo proof created.
4. Open Proof Gallery: total raised updates and the record is labeled “Demo Proof”.

The public demo can run without a real Zcash node or funded Solana key. In that configuration it is explicitly labeled **DEMO MODE** and uses deterministic local/mock state; it should not be described as a live on-chain Zcash-to-Solana mint.

## 7. Go-to-Market Strategy
```
Primary channels:
- Privacy-focused communities (Zcash forums, Telegram, X)
- Creator & activist networks that need discreet funding
- Public-goods and open-source funding platforms

Initial acquisition:
- Launch with 1–2 high-visibility privacy campaigns (research, journalism, advocacy)
- Partner with Zcash wallets and Solana NFT communities for co-marketing
- Open-source the core agent so other platforms can integrate ShieldGive-style proofs

Monetization (post-MVP):
- Platform fee on successful donations (optional, transparent)
- Premium features for multi-campaign creators (dashboard, analytics, custom NFT metadata)
- White-label / API access for existing donation platforms that want private rails
```

## 8. Demand Validation / Insight
```
- Donors to sensitive causes (activists, journalists, independent researchers) already prefer privacy; current on-chain tools force a trade-off between privacy and collectible proof.
- Zcash shielded transactions solve privacy; Solana + Metaplex solve the “proof I can keep” problem.
- Combining both with full automation removes the last friction (manual claiming), making private giving as seamless as transparent giving.
```

## 9. Team Background (template — fill with real details)
```
[Your Name] — [Role]
Background: [1–2 sentences about your actual experience]

[Co-founder Name, if any] — [Role]
Background: [Actual background]

Location: [Actual city, country]
```

## 10. Pitch Video Script (~2:30)

**[0:00 – 0:20] Hook + Problem**  
“Every on-chain donation leaves a permanent public record of who gave and how much. For donors supporting sensitive causes — journalists, activists, independent researchers — that visibility is a deal-breaker. Privacy tools exist, but they usually mean giving up any collectible proof of contribution.”

**[0:20 – 0:50] Solution**  
“ShieldGive changes that. Donors send ZEC through a shielded transaction — identity and amount stay private. A background agent automatically detects the payment using a viewing key, then mints an NFT proof directly to the donor’s Solana wallet. No claim button. No transaction hash pasting. Fully automatic.”

**[0:50 – 1:20] Demo**  
(Show screen recording of the actual product)  
“Here’s the public demo. Register a Solana wallet, run the demo donation pipeline, and watch the agent correlate, validate, and produce a demo NFT proof. The interface clearly labels mock components so judges can distinguish the demonstration from live blockchain integrations.”

**[1:20 – 1:50] Why this combination**  
“We deliberately chose native Zcash shielded transactions instead of custom ZK circuits, and Metaplex on Solana for the proof layer. The agent is a deterministic scheduled job — simple, reliable, and easy for judges to verify. This combination is rare and highly differentiated.”

**[1:50 – 2:20] Market + Vision**  
“Privacy-preserving public goods funding is still early. ShieldGive is the first step toward a platform where creators can raise funds without forcing donors to choose between privacy and recognition. Post-hackathon we plan multi-campaign support, real-time detection, and multi-chain NFT proofs.”

**[2:20 – 2:30] Close**  
“ShieldGive — private donation UX with automated proof. Thank you.”

## 11. Demo Video Script (~2:00)

1. Open Campaign page → show title & shielded address  
2. Register a Solana wallet (type a real-looking address)  
3. Switch to Agent Dashboard  
4. Enter 0.25 ZEC → click “Run agent pipeline”  
5. Show the live log updating: detected → validated → minted  
6. Switch to Gallery → total raised increased, NFT proof visible  
7. Briefly show the code structure or agent pipeline if time allows  
8. End on the gallery with the privacy message

## 12. Recommended Logo Concept
Simple shield + checkmark / lock icon in teal (#14b8a6) on dark background.  
SVG already included in the repo at `frontend/public/logo.svg`.  
Export a high-resolution PNG (512×512 or 1024×1024) for the portal upload.

## 13. Final Checklist Before Submit

- [ ] Account created on colosseum.com and joined Crypto World's Fair
- [ ] All team members have accounts
- [ ] GitHub repo public (or access granted to hackathon@colosseum.com)
- [ ] Live demo URL verified and added: https://shield-give.vercel.app/
- [ ] Logo uploaded
- [ ] Pitch video (≤ 3 min) uploaded and accurately describes demo/live status
- [ ] Demo video (≤ 3 min) uploaded and accurately labels mock/live components
- [ ] Short description + longer description filled
- [ ] Blockchains listed (Zcash + Solana)
- [ ] GTM + demand validation written
- [ ] Team bios completed with real details
- [ ] Weekly update videos (optional but recommended)

---

**Repo:** https://github.com/wadezigh96/ShieldGive  
**Track:** Verify the current official event portal before submitting.
