# ShieldGive — Demo Video Recording Guide (YouTube)

**Target length:** 1:45 – 2:15  
**Language:** English  
**Voiceover file:** `ShieldGive_Demo_Voiceover.mp3` (ready to use)

---

## What you already have

- Ready English voiceover: `docs/ShieldGive_Demo_Voiceover.mp3`
- Full product UI (Campaign → Agent → Gallery)
- Script timed to the voiceover below

---

## How to record (recommended method)

### Option A — Loom (easiest)
1. Install Loom (or use loom.com)
2. Start recording (Screen + optional camera off)
3. Open the app (local `npm run dev` or your Vercel URL)
4. Play the voiceover in the background (or import it later in editing)
5. Follow the shot list below while the voiceover plays

### Option B — OBS Studio (higher quality)
1. Add Display Capture / Window Capture of the browser
2. Import `ShieldGive_Demo_Voiceover.mp3` as Audio Input
3. Record while following the timing

### Option C — Quick (CapCut / DaVinci / iMovie)
1. Record silent screen recording first
2. Import the MP3 voiceover in the editor
3. Align screen actions to the narration

---

## Shot-by-shot timing (match the voiceover)

| Time | What to show on screen | Narration (summary) |
|------|------------------------|---------------------|
| 0:00 – 0:12 | Logo / title or Campaign page hero | Intro + problem |
| 0:12 – 0:35 | Campaign page: title, description, shielded address, totals | Campaign + privacy |
| 0:35 – 0:50 | Scroll to “Register your Solana wallet” form, type a wallet | Register wallet |
| 0:50 – 1:10 | Switch to **Agent** tab, show status cards | Explain the agent |
| 1:10 – 1:35 | Enter `0.25`, click **Run agent pipeline**, watch logs update | Simulate + live log |
| 1:35 – 1:55 | Switch to **Gallery**, show totals + minted NFT | Gallery privacy |
| 1:55 – 2:10 | End on Gallery or logo | Closing |

---

## Exact actions to perform while recording

1. **Start on Campaign page**
   - Show the shield logo and “Live Campaign”
   - Highlight the shielded address (you can click Copy)
   - Point out Total Raised and Donations counters

2. **Register wallet**
   - Paste any valid-looking Solana address (example: `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`)
   - Click “Register wallet”
   - Wait for the success message

3. **Go to Agent Dashboard**
   - Show the 4 status cards (Zcash Mode = Mock, etc.)
   - Type `0.25` in the amount field
   - Click **Run agent pipeline**
   - Wait ~2–3 seconds and let the log entries appear (detected → validated → minted)

4. **Go to Gallery**
   - Show the three summary cards (Total Raised, Donations, NFTs Minted)
   - Scroll the minted proof list if anything appeared
   - End on the privacy note at the bottom

---

## YouTube upload tips

- **Title:** `ShieldGive Demo — Private Zcash Donations + Automatic Solana NFT Proof`
- **Description (copy-paste):**
  ```
  ShieldGive enables private donations via Zcash shielded transactions while automatically minting a collectible NFT proof on Solana.

  • Donors stay anonymous on-chain
  • Background agent detects payment and mints NFT automatically
  • No manual claim required

  Built for Colosseum Crypto World's Fair — Zcash Track

  GitHub: https://github.com/wadezigh96/ShieldGive
  ```
- **Tags:** `Zcash, Solana, NFT, privacy, donation, Colosseum, hackathon, ShieldGive`
- Keep video **under 3 minutes** (Colosseum requirement)

---

## Checklist before upload

- [ ] Screen recording matches the voiceover timing
- [ ] Audio is clear (voiceover volume good, no background noise)
- [ ] Resolution at least 1080p
- [ ] No personal info or real private keys visible
- [ ] Link works if you mention a live demo URL

---

**Voiceover file location:**  
`docs/ShieldGive_Demo_Voiceover.mp3`

You can download it and use it directly in your editor.
