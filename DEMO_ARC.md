# Settle — Arc Demo Script

Target: **60–90 seconds**. Do not create another real payment for the recording. Use the existing mainnet proof.

## Recording setup

- Open: `https://settle-arc.vercel.app`
- Keep browser zoom at 100%.
- Hide bookmarks/sidebar if they clutter the frame.
- Have this proof URL ready in a second tab:
  `https://settle-arc.vercel.app/inspect/pi_i0vBa7M1h7j72kwXVrFS5uEt7V0ehmfV`
- Optional third tab: Arc explorer transaction:
  `https://explorer.arc.io/tx/0x588d0c9423a459f040cbe7af96c7c2d70e26a13fc14933f48d7dc234d6703ae7`

## 0:00–0:15 — Problem + product

**Screen:** landing-page hero and proof card.

**Voiceover:**

“Settle is payment truth for autonomous agents. An agent declares the USDC payment it expects, the payer transacts directly onchain, and Settle independently verifies what actually happened.”

Pause briefly on the hero proof card showing Arc, expected `0.10`, received `0.10`, `exact_payer`, and final on inclusion.

## 0:15–0:30 — Show the agent workflow

**Screen:** scroll through the four-step Declare → Pay → Reconcile → Verify section, then reach the live console.

**Voiceover:**

“The flow is simple: declare the obligation, pay outside Settle, reconcile canonical chain evidence, then return a deterministic status and proof the agent can act on.”

## 0:30–0:45 — Show Arc-specific intent creation

**Screen:** in the live console, switch the network selector from Base to Arc. Do not submit a new intent.

Point out that confirmations become `1` and the helper copy says Arc is final on inclusion. Briefly show the generated API request on the right.

**Voiceover:**

“Settle supports both Base and Arc. On Arc, it uses native USDC semantics and deterministic finality, while the public API stays the same.”

## 0:45–1:10 — Real Arc mainnet proof

**Screen:** switch to the existing proof inspector:

`https://settle-arc.vercel.app/inspect/pi_i0vBa7M1h7j72kwXVrFS5uEt7V0ehmfV`

Show:
- status `paid`;
- expected `0.10 USDC`;
- received `0.10 USDC`;
- remaining `0.00`;
- chain `Arc`;
- exact payer match;
- one confirmation/final on inclusion;
- onchain evidence row.

**Voiceover:**

“This is a real Arc mainnet payment. Settle expected 0.10 USDC, received exactly 0.10, matched the declared payer, and reconciled the intent to paid with one final Arc confirmation.”

## 1:10–1:25 — Evidence + close

**Screen:** open or point to the transaction evidence/explorer link, then finish on the inspector or logo.

**Voiceover:**

“The evidence is tied to the actual Arc transaction, not a user-supplied claim. Settle never holds keys or moves funds — it gives agents a reliable payment truth layer they can plug into any workflow.”

End on the Settle wordmark.

## Proof facts for captions

- Product: **Settle**
- Tagline: **Payment truth for autonomous agents.**
- Network: **Arc mainnet**
- Chain ID: **5042**
- Intent: `pi_i0vBa7M1h7j72kwXVrFS5uEt7V0ehmfV`
- Amount: **0.10 USDC**
- Status: **paid**
- Match: **exact_payer**
- Block: **26004010**
- Transaction: `0x588d0c9423a459f040cbe7af96c7c2d70e26a13fc14933f48d7dc234d6703ae7`

## What not to say

- Do not call Settle a wallet, bridge, payment processor, escrow or custody product.
- Do not imply Settle sent the transaction.
- Do not say the product is only a dashboard; the API is the product and the UI is the demo console.
- Do not claim support for chains beyond Base and Arc.
- Do not claim background monitoring; reconciliation is caller-triggered and the demo UI polls while open.
