# ShieldGive — YouTube Demo Video Guide

**Target length:** ~90–120 seconds  
**Style reference:** Clean title slides + problem + solution + live product walkthrough + closing links  
**Language:** English  
**Voiceover:** Use existing `ShieldGive_Demo_Voiceover.mp3` or re-record with the script below

**Live demo:** https://shield-give.vercel.app/  
**GitHub:** https://github.com/wadezigh96/ShieldGive

---

## Recommended structure (timeline)

| Time | Screen | Narration (speak this) |
|------|--------|------------------------|
| 0:00 – 0:08 | **Title slide** | “Hi, this is ShieldGive — private donations with collectible proof, built for the Colosseum Crypto World’s Fair Zcash track.” |
| 0:08 – 0:18 | **Problem slide** | “On-chain donations normally expose who gave and how much. That discourages support for sensitive causes — and private donors get no proof they can keep.” |
| 0:18 – 0:32 | **Solution slide** | “ShieldGive lets donors send Zcash through a shielded address. A background agent detects the payment and automatically mints an NFT proof to their Solana wallet. No claim button. Identity stays private.” |
| 0:32 – 0:50 | **Live: Campaign page** | “Here’s the campaign page. Total raised, donation count, and the shielded address. Donors register their Solana wallet once.” |
| 0:50 – 1:10 | **Live: Agent Dashboard** | “This is the agent dashboard — a deterministic scheduled job, not an LLM. We simulate a shielded donation of 0.25 ZEC and run the pipeline.” |
| 1:10 – 1:25 | **Live: Agent logs + Gallery** | “Watch the log: detected, validated, NFT minted. The gallery updates totals without revealing any donor identities.” |
| 1:25 – 1:40 | **Closing slide** | “Private donations. Collectible proof. Zero friction. Repo and live demo are in the submission. Thanks for watching — ShieldGive.” |

---

## Slide text (copy into CapCut / Canva / Keynote)

### 1. Title (0:00)
```
ShieldGive
Private Donation Proof via Zcash + Solana NFT

Colosseum Crypto World's Fair — Zcash Track
```

### 2. The Problem (0:08)
```
The Problem

On-chain donations expose identity and amount
Private donors receive no collectible proof
```

### 3. The Solution (0:18)
```
The Solution

Shielded Zcash payment → background agent → automatic Solana NFT
No manual claim · Identity stays private on-chain
```

### 4. Closing (1:25)
```
ShieldGive

Live:  https://shield-give.vercel.app
GitHub: https://github.com/wadezigh96/ShieldGive

Thanks for watching
```

---

## Exact actions on the live demo (record after title slides)

1. Open https://shield-give.vercel.app/
2. **Campaign**
   - Show title “Support Privacy Research”
   - Point at Total Raised / Donations
   - Show shielded address + Copy
   - Paste any Solana-looking address → click **Register wallet**
3. Click **Agent**
   - Show status cards (Mock mode is fine for demo)
   - Amount `0.25` → click **Run agent pipeline**
   - Wait ~2 seconds for SUCCESS logs (detected → validated → minted)
4. Click **Gallery**
   - Show Total Raised, Donations Detected, NFTs Minted
   - Show the minted proof row (amount + redacted wallet)
5. End → cut to closing slide

**Tip:** Do not hard-refresh during the recording. State is saved in localStorage, so Gallery will show the NFT after the agent run.

---

## YouTube upload

**Title**
```
ShieldGive Demo — Private Zcash Donations + Automatic Solana NFT Proof
```

**Description**
```
ShieldGive enables private donations via Zcash shielded transactions while automatically minting a collectible NFT proof on Solana.

• Donor identity and amount stay private on-chain
• Background agent detects payment and mints the NFT — no claim step
• Public gallery shows totals without revealing donors

Built for Colosseum Crypto World's Fair — Zcash Track

Live demo: https://shield-give.vercel.app/
GitHub: https://github.com/wadezigh96/ShieldGive
```

**Tags**
```
Zcash, Solana, NFT, privacy, donation, Colosseum, hackathon, ShieldGive, shielded transactions
```

Keep the video **under 3 minutes**.

---

## Checklist

- [ ] Title + Problem + Solution slides (dark background, white/teal text)
- [ ] Live Campaign → register wallet
- [ ] Live Agent → Run pipeline → SUCCESS logs visible
- [ ] Live Gallery → totals + NFT proof visible
- [ ] Closing slide with live URL + GitHub
- [ ] English narration clear
- [ ] 1080p, no personal keys or real funds on screen
