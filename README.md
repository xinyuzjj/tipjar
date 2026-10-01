# TipJar — Permanent On-chain Microblog with Zero-Custody Tipping

> A Twitter-style social app where **posts live forever on Arc**, identity is claimed on-chain, and tips go straight from wallet to wallet.
> Live on **Arc mainnet** (chainId 5042) — where a post costs **~$0.0014** and a tip can be **$0.01**.

**Contract:** [`0x005a5a60054e56d082ed0de3ccc6cb72c2a3350e`](https://explorer.arc.io/address/0x005a5a60054e56d082ed0de3ccc6cb72c2a3350e) (Arc mainnet)

---

## The core thesis: Arc makes small payments make sense

Tipping is bounded by gas cost. Below a certain amount, tipping is absurd — the fee exceeds the tip.

| Chain | Gas per tx | Smallest tip that makes sense |
|---|---|---|
| Ethereum L1 | $0.50 – $5.00 | $5 |
| Most L2s | $0.02 – $0.20 | $0.50 |
| **Arc** | **~$0.0014** | **$0.01** |

**The monetizable content granularity drops by 100–1000×.**

A useful reply, a commit, a diagram, 30 seconds of audio — on a $0.50-gas chain, tipping them costs 10× the content's value. On Arc this works for the first time. That is the entire reason this project exists on Arc and nowhere else.

---

## What's actually deployed

Everything below is live on Arc mainnet — not a mockup:

| Component | Status |
|---|---|
| `TipJarSocial` contract | ✅ deployed at `0x005a5a60…350e` |
| Real posts on-chain | ✅ posts + replies written as event logs |
| On-chain usernames | ✅ globally unique, set-once |
| Indexer (Cloudflare Worker) | ✅ reads `eth_getLogs`, serves REST API |
| Frontend | ✅ Twitter-style UI, EN/ZH |

---

## Features

### 1. Posts are permanent, and cheap
Post content is written **only into event logs** — never `SSTORE`. Events are permanent on-chain and readable via `eth_getLogs`, but cost ~10× less than storage.

| Post length | Gas | Cost |
|---|---|---|
| 50 chars | 60,348 | $0.0012 |
| 200 chars | 69,612 | $0.0014 |
| 1,000 chars | 121,708 | $0.0024 |
| 5,000 chars | 380,652 | $0.0076 |

Only two values touch storage: `postCount` and `postAuthor` (needed for tipping). There is no length limit — gas is the limit.

### 2. Zero-custody tipping
`tipPost(postId, note)` forwards `msg.value` **directly to the author** via `call{value:}`. The contract never holds funds and takes no cut. Tips of ~$0.01 are only viable because Arc gas is ~$0.0014.

### 3. On-chain unique usernames
`setUsername(name)` — 3–20 chars, lowercase letters / digits / underscore. Uniqueness is enforced by a `keccak256(name) => address` mapping, so it cannot be bypassed by the frontend. **Set once, then locked** — a username is an identity, not a nickname.

### 4. Identity binding via OAuth
GitHub / X login, then a single on-chain `bind()` transaction declares the link. Forked repos are auto-filtered when displaying a user's projects.

### 5. Points, achievements, daily check-in
- **Points** are derived entirely from on-chain actions (post +10, reply +5, tip +20, tip received +30, bind +50, username +50, check-in +15). There is no admin endpoint — anyone can recompute the leaderboard from chain data.
- **20 achievements**, each carrying its own point reward, unlocked automatically from on-chain facts (Genesis Post, Whale, Star Creator, Streak 30 …).
- **Daily check-in** = posting `#checkin`. No contract change needed: the on-chain timestamp plus author address make it self-verifying. Consecutive days add a growing bonus.

### 6. Bilingual UI (EN default, ZH switchable)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  TipJarSocial.sol  (Arc mainnet)                    │
│  0x005a5a60054e56d082ed0de3ccc6cb72c2a3350e         │
│                                                     │
│  storage: postCount, postAuthor,                    │
│           usernameOf, ownerOfName, authors          │
│  events:  Post, Tipped, IdentityBound, UsernameSet  │
└────────────────────┬────────────────────────────────┘
                     │ eth_getLogs (chunked, 5k blocks/req)
        ┌────────────▼─────────────┐
        │  Cloudflare Worker       │  indexer + REST API
        │  src/index.js            │  (Cron + on-demand)
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │  Cloudflare KV           │  cache — the chain is the database
        └────────────┬─────────────┘
                     │
        ┌────────────▼─────────────┐
        │  Static frontend         │  viem + wallet, no build step
        └──────────────────────────┘
```

**Design rule:** the chain is the source of truth. KV is a rebuildable cache — wipe it and the indexer reconstructs everything from event logs. Posts, usernames, tips and points all survive a full cache wipe.

---

## Arc-specific findings (things that differ from vanilla EVM)

Verified by direct mainnet testing, not copied from docs:

### 1. USDC has two decimal precisions — the easiest way to lose 10¹² ×
| Context | Decimals |
|---|---|
| Native balance / gas / `msg.value` | **18** |
| ERC-20 view (`balanceOf`, `transfer`, `Transfer` event) | **6** |

Same account: `eth_getBalance` → `9355344270750000000`, `balanceOf` → `9355344`. Mixing them up is a 10¹² error. This project uses **18** for tipping (`msg.value`) and never touches the ERC-20 view for money movement.

### 2. 20 gwei is a hard floor, and violations fail *silently*
Set `maxFeePerGas` below 20 gwei and the transaction is **dropped with no error** — no revert, no message, it simply disappears. The frontend sets it explicitly on every write.

### 3. Gas is paid in USDC
Users never need ETH. But "no money" and "no gas" are the same failure mode on Arc.

### 4. `eth_getLogs` has a range limit and rate-limits under load
A 20,000-block query is rejected (`requested range too large`); hammering it returns `rate limit exceeded`. The indexer **chunks into 5,000-block windows with a 250 ms gap** between requests.

### 5. Mainnet has no faucet
Testnet: `faucet.circle.com`. Mainnet: bridge in via Circle CCTP.

### 6. Deploy cost is real money
Contract deployment was 1,124,969 gas = **0.0225 USDC**. Posting was optimized from $0.0022 → $0.0014 by removing two `SSTORE`s (post time and parent id live in the event, not storage).

---

## Repo layout

```
tipjar/
├── contracts/TipJarSocial.sol      # the contract
├── worker/
│   ├── wrangler.toml               # contract address, event topics, KV binding
│   └── src/index.js                # indexer + REST API + OAuth callbacks
├── web/
│   ├── index.html                  # Twitter-style UI (no build step)
│   └── app.js                      # viem wallet layer + i18n + rendering
├── scripts/
│   ├── compile.mjs                 # solc-js build + gas report
│   ├── deploy.mjs                  # deploy to testnet / mainnet
│   ├── gen-topics.mjs              # derive event topic0 from the ABI
│   ├── test-decode.mjs             # hand-written ABI decoder tests (15/15)
│   ├── test-indexer.mjs            # indexer against real chain data
│   └── cost.mjs                    # posting cost curve
└── build/                          # ABI, bytecode, topics, deploy record
```

---

## Run it locally

```bash
npm install

# 1. verify the ABI decoder against real chain data (no credentials needed)
node scripts/test-decode.mjs      # 15/15 pass, incl. the 5000-char boundary

# 2. start the indexer + API
cd worker && npx wrangler dev --port 8788 --local

# 3. trigger an index pass and inspect
curl "http://localhost:8788/api/index?force=1"
curl  http://localhost:8788/api/feed
curl  http://localhost:8788/api/scores
curl  http://localhost:8788/api/checkin/<address>

# 4. serve the frontend
cd ../web && python -m http.server 5501
# open http://localhost:5501
```

### Deploying

```bash
# contract
node scripts/compile.mjs
node scripts/deploy.mjs mainnet        # needs PRIVATE_KEY in .env + USDC on Arc

# worker + frontend
cd worker && npx wrangler deploy
npx wrangler pages deploy ../web --project-name tipjar
```

`PRIVATE_KEY` lives only in `.env` (git-ignored) and in the Worker's secret store. It is never sent to the frontend.

---

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | indexer state (cursor, last indexed) |
| `GET /api/feed?limit=N` | top-level posts with reply counts |
| `GET /api/replies/:postId` | replies to a post |
| `GET /api/user/:address` | a user's posts + identity |
| `GET /api/score/:address` | points + unlocked achievements |
| `GET /api/scores?limit=N` | points leaderboard |
| `GET /api/achievements` | achievement definitions (bilingual + point value) |
| `GET /api/checkin/:address` | check-in days / streak |
| `GET /api/leaderboard` | top tippers by USDC received |
| `GET /api/tips` | recent tips |
| `GET /api/index?force=1` | trigger an index pass |

---

## Roadmap

| Stage | Content |
|---|---|
| **v1 (this repo)** | posts + replies + tipping + usernames + points/achievements + check-in |
| v2 | programmable tips (conditional / recurring / pools) |
| v3 | supporter credentials (NFT) + creator analytics |
| v4 | cross-chain tipping via CCTP + content discovery |

**Why v4 matters:** once tipping data accumulates, "who receives the most *small* tips" becomes a **sybil-resistant content-quality signal** — because faking it costs real money.

---

## Verification record

Every Arc-specific claim above was tested on this machine against mainnet:

```
mainnet chainId   : 5042 (0x13b2)
mainnet gasPrice  : 20.000000432 gwei  (confirms the 20 gwei floor)
contract          : deployed, 0x005a5a60054e56d082ed0de3ccc6cb72c2a3350e
deploy cost       : 1,124,969 gas = 0.0225 USDC
ABI decoder       : 15/15 tests pass (incl. the 5000-char content boundary)
indexer           : scans 20,001 blocks in ~4.6 s, events → KV → API
runtime           : verified under the Cloudflare Workers runtime (miniflare)
```
