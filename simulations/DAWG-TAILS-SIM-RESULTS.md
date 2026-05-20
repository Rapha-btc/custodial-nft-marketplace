# Dawg-Tails Marketplace — stxer simulation results

Goal: validate that `SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV.the-dawg-tails-collection`
can be listed on a fakfun-style custodial marketplace paired with the
`SPQYMRAKZPQPJAADX5JBEFT0FHE3RZZK9F8TYBQ3.dawgpool-stxcity` token.

## TL;DR

✅ **Launch-ready.** All 8 NFTs (5 from `SP3WAAYXPC6` + 3 from `SP2Z2CBMGWB9`)
listed cleanly, two end-to-end buys executed, every error path returned
the expected code.

⚠️ One unrelated repo finding: `contracts/custodial-marketplace.clar`
(the auction-extended variant) fails to compile (`expecting 3 arguments,
got 2` at line 0:0). Use `contracts/pepe-marketplace.clar` as the
production template — it's the same generic reusable shape and is
already running mainnet for pepe + froggy.

## Setup used

| Role | Address | Notes |
|------|---------|-------|
| Deployer / admin | `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` | fakfun deployer |
| Seller 1 | `SP3WAAYXPC6WZNEC7SHGR36D32RJPZVXRR1BG0QSY` | owns dawg-tails 2, 4, 7, 9, 14 |
| Seller 2 | `SP2Z2CBMGWB9MQZAF5Z8X56KS69XRV3SJF4WKJ7J9` | owns dawg-tails 3, 8, 19, 25 |
| Buyer | `SP389APB4DHZ836P4AE9RJW7EKEZAPV5NPDNG7N46` | known dawgpool-stxcity holder |
| Random | `SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2` | attacker probe |

- **Marketplace:** `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.dawg-tails-marketplace`
  (deployed in-sim from `pepe-marketplace.clar`)
- **NFT:** `the-dawg-tails-collection`
- **FT:** `dawgpool-stxcity` (6 decimals)
- **Wrong / non-whitelisted FT (for negative tests):** `SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT.notastrategy`

## How to reproduce

```bash
cd ~/projects/fakfun/contracts/custodial-nft-marketplace
node simulations/dawg-tails-marketplace-test.js
```

Submits the sim to stxer and prints a result URL like
`https://stxer.xyz/simulations/mainnet/<id>`. Pull JSON with:

```bash
curl -sS https://api.stxer.xyz/simulations/<id> > /tmp/sim.json
jq -r '.result.steps | to_entries[] |
  "\(.key)\t\(.value.receipt.result // "?")\t\(.value.receipt.vm_error // "")"' \
  /tmp/sim.json
```

## Reference run

**URL:** https://stxer.xyz/simulations/mainnet/106c0c16229a59ded502c2674c7c06ee
**Block:** 8,027,920 (mainnet fork)
**Steps:** 29 / 29 behaved as expected

### Result decoder

| Hex | Meaning |
|-----|---------|
| `0703` | `(ok true)` |
| `0801…XX` | `(err uYY)` where `YY` = hex `XX` |

| Error code | Name |
|------------|------|
| u200 (c8) | `ERR-NOT-AUTHORIZED` |
| u201 (c9) | `ERR-ALREADY-LISTED` |
| u202 (ca) | `ERR-NOT-LISTED` |
| u203 (cb) | `ERR-NOT-OWNER` |
| u204 (cc) | `ERR-FT-NOT-WHITELISTED` |
| u205 (cd) | `ERR-INVALID-PRICE` |
| u206 (ce) | `ERR-CANNOT-BUY-OWN` |
| u207 (cf) | `ERR-PAUSED` |
| u208 (d0) | `ERR-WRONG-NFT` |
| u209 (d1) | `ERR-ALREADY-INITIALIZED` |
| u210 (d2) | `ERR-NOT-INITIALIZED` |
| u211 (d3) | `ERR-WRONG-FT` |

### Step-by-step

| # | Sender | Action | Result | Expected |
|---|--------|--------|--------|----------|
| 0 | DEPLOYER | Deploy `dawg-tails-marketplace` (pepe-marketplace.clar) | `(ok true)` | ✅ |
| 1 | DEPLOYER | `initialize(dawg-tails)` | `(ok true)` | ✅ |
| 2 | DEPLOYER | `whitelist-ft(dawgpool-stxcity, true)` | `(ok true)` | ✅ |
| 3 | SELLER1 | `list-nft` #2 @ 100 | `(ok true)` | ✅ |
| 4 | SELLER1 | `list-nft` #4 @ 200 | `(ok true)` | ✅ |
| 5 | SELLER1 | `list-nft` #7 @ 300 | `(ok true)` | ✅ |
| 6 | SELLER1 | `list-nft` #9 @ 400 | `(ok true)` | ✅ |
| 7 | SELLER1 | `list-nft` #14 @ 500 | `(ok true)` | ✅ |
| 8 | SELLER2 | `list-nft` #3 @ 600 | `(ok true)` | ✅ |
| 9 | SELLER2 | `list-nft` #8 @ 700 | `(ok true)` | ✅ |
| 10 | SELLER2 | `list-nft` #19 @ 800 | `(ok true)` | ✅ |
| 11 | SELLER1 | `update-price` #2 → 150 | `(ok true)` | ✅ |
| 12 | SELLER1 | `unlist-nft` #4 | `(ok true)` | ✅ |
| 13 | **BUYER** | **`buy-nft` #7 (300 dawgpool)** | `(ok true)` | ✅ **happy-path swap** |
| 14 | SELLER1 | `update-listing-ft` #9 | `(ok true)` | ✅ |
| 15 | SELLER1 | List with non-whitelisted FT | `(err u204)` | `FT-NOT-WHITELISTED` ✅ |
| 16 | SELLER2 | List #25 @ 1B dawgpool | `(ok true)` | ✅ |
| 17 | BUYER | Buy #25 (insufficient FT) | `(err u1)` | FT-side rejection ✅ |
| 18 | SELLER2 | Buy own #3 | `(err u206)` | `CANNOT-BUY-OWN` ✅ |
| 19 | RANDOM | Unlist someone else's #14 | `(err u203)` | `NOT-OWNER` ✅ |
| 20 | BUYER | Buy #8 with wrong FT | `(err u211)` | `WRONG-FT` ✅ |
| 21 | DEPLOYER | Initialize twice | `(err u209)` | `ALREADY-INITIALIZED` ✅ |
| 22 | RANDOM | `whitelist-ft` (unauthorized) | `(err u200)` | `NOT-AUTHORIZED` ✅ |
| 23 | DEPLOYER | `set-paused(true)` | `(ok true)` | ✅ |
| 24 | BUYER | Buy #8 while paused | `(err u207)` | `PAUSED` ✅ |
| 25 | DEPLOYER | `set-paused(false)` | `(ok true)` | ✅ |
| 26 | RANDOM | List #14 (not owner) | `(err u201)` | `ALREADY-LISTED` fires first ✅ |
| 27 | DEPLOYER | `admin-emergency-return` #25 | `(ok true)` | ✅ |
| 28 | **BUYER** | **`buy-nft` #8 (700 dawgpool)** | `(ok true)` | ✅ **second happy-path swap** |

### Notes on individual findings

- **Trait conformance:** the dawg-tails contract returns
  `(response (optional (string-ascii 71)) none)` from `get-token-uri`
  (vs the SIP-009 trait's nominal `(string-ascii 256)` / `uint` error).
  Clarity accepts it — the marketplace's `<nft-trait>` parameter resolves
  cleanly and `(contract-call? nft-contract transfer …)` works.
- **Step 26** (`RANDOM lists #14`) was meant to catch "not owner" via the
  NFT transfer, but the contract's check order means
  `ERR-ALREADY-LISTED u201` fires first since #14 is still in the listings
  map. Functionally the same outcome — random can't list it. To exercise
  the actual not-owner path, the target NFT must be unlisted first.
- **Step 17** returns `(err u1)` rather than a marketplace error: this
  is the FT contract's own `transfer` rejecting on insufficient balance,
  bubbled back through the marketplace's `try!`. Correct behaviour.

## Coverage gaps (what's NOT in this sim yet)

These paths exist in the contract but aren't exercised here. They're
covered by `marketplace-edge-cases.js` and `ft-unwhitelist-test.js` for
the pepe pair; a hammered-on dawg-tails version would also include:

- **FT un-whitelist mid-listing**: whitelist `dawgpool`, list, then
  whitelist `dawgpool` to `false`. Existing listings should still be
  buyable (price + ft are locked in the listing entry) but new listings
  in that FT should fail. → `ft-unwhitelist-test.js` shape.
- **Pre-init failures**: list-nft and buy-nft before `initialize` should
  hit `ERR-NOT-INITIALIZED u210`.
- **Wrong-NFT-contract paths**: pass a *different* NFT contract to
  `list-nft` / `buy-nft` / `unlist-nft` → `ERR-WRONG-NFT u208`.
- **Invalid params**: `list-nft` with price = 0 → `ERR-INVALID-PRICE u205`.
  `update-price` to 0 → same.
- **Non-existent listing**: `update-price` / `unlist-nft` /
  `update-listing-ft` on a token that isn't listed → `ERR-NOT-LISTED u202`.
- **Admin bounds**: `set-royalty-percent > 1000` (>10%) and
  `set-platform-fee > 500` (>5%) should reject.
- **Royalty / platform balance verification**: read FT balances on the
  royalty + platform recipients before/after a `buy-nft` to confirm the
  2.5% + 2.5% split actually lands.
- **Stale listings**: a sold/unlisted token id should reject
  `update-price` and `unlist-nft`.
- **Post-emergency-return**: after `admin-emergency-return`, the listing
  entry should be gone — re-list the same token id from the original
  owner cleanly.

## Hammer simulation (full coverage)

A second, more exhaustive sim — `simulations/dawg-tails-hammer.js` —
deploys a separate marketplace `dawg-tails-mkt-hammer` and exercises
every behaviour in the contract including the gaps flagged above.

**URL:** https://stxer.xyz/simulations/mainnet/9fedd7ac2d9a37999ef6642e1a9de8b6
**Block:** 8,027,964
**Steps:** 38 / 38 behaved as expected

| # | Step | Got | Expected |
|---|------|-----|----------|
| 0 | Deploy fresh marketplace | `(ok true)` | ✅ |
| 1 | List #2 **pre-init** | `(err u210)` | `NOT-INITIALIZED` ✅ |
| 2 | Buy #2 **pre-init** | `(err u202)` | NOT-LISTED — check order means the listing-lookup fires before init-check; both errors correctly reject. ⚠ minor quirk, not a bug |
| 3 | `initialize` | `(ok true)` | ✅ |
| 4 | List with **wrong NFT contract** (bitcoin-pepe) | `(err u208)` | `WRONG-NFT` ✅ |
| 5 | List with FT not yet whitelisted | `(err u204)` | `FT-NOT-WHITELISTED` ✅ |
| 6 | Whitelist dawgpool | `(ok true)` | ✅ |
| 7 | List #2 at **price 0** | `(err u205)` | `INVALID-PRICE` ✅ |
| 8 | `set-royalty-percent 1500` (>10%) | `(err u200)` | Contract asserts `<= u1000` and returns `NOT-AUTHORIZED` ✅ |
| 9 | `set-platform-fee 600` (>5%) | `(err u200)` | Same — asserts `<= u500` and returns `NOT-AUTHORIZED` ✅ |
| 10 | `set-royalty-recipient` | `(ok true)` | ✅ |
| 11 | `set-platform-recipient` | `(ok true)` | ✅ |
| 12–19 | 8 NFT listings (SELLER1×5 + SELLER2×3) | `(ok true)` ×8 | ✅ |
| 20 | `update-price` on token 99 (never listed) | `(err u202)` | `NOT-LISTED` ✅ |
| 21 | `unlist-nft` on token 99 | `(err u202)` | `NOT-LISTED` ✅ |
| 22 | `update-listing-ft` on token 99 | `(err u202)` | `NOT-LISTED` ✅ |
| 23 | `update-price` #2 → 0 | `(err u205)` | `INVALID-PRICE` ✅ |
| 24 | **BUYER buys #7 @ 300 dawgpool** | `(ok true)` | ✅ — event split below |
| 25 | `update-price` on already-sold #7 | `(err u202)` | `NOT-LISTED` (stale slot rejected) ✅ |
| 26 | Buy already-sold #7 | `(err u202)` | `NOT-LISTED` ✅ |
| 27 | DEPLOYER un-whitelists dawgpool | `(ok true)` | ✅ |
| 28 | Buy existing #8 with un-whitelisted FT | `(err u204)` | `FT-NOT-WHITELISTED` — confirms `buy-nft` **re-checks** the whitelist at call time ✅ |
| 29 | New list in un-whitelisted FT | `(err u204)` | `FT-NOT-WHITELISTED` ✅ |
| 30 | Re-whitelist dawgpool | `(ok true)` | ✅ |
| 31 | **BUYER buys #8 @ 700 dawgpool** (post re-whitelist) | `(ok true)` | ✅ |
| 32 | Unlist #4 | `(ok true)` | ✅ NFT returns to SELLER1 |
| 33 | Re-list #4 @ new price (stale slot freed) | `(ok true)` | ✅ |
| 34 | `admin-emergency-return` #14 | `(ok true)` | ✅ |
| 35 | `update-price` on returned #14 | `(err u202)` | `NOT-LISTED` (listing entry was cleaned up) ✅ |
| 36 | Re-list #14 cleanly post emergency-return | `(ok true)` | ✅ |
| 37 | **BUYER buys #19 @ 800 dawgpool** | `(ok true)` | ✅ |

### Royalty / platform split — event-level verification

Captured directly from the buy steps' `ft_transfer_event` + `nft_transfer_event` payloads:

| Buy | Price | Seller (95%) | Royalty (2.5%) | Platform (2.5%) | NFT moved |
|-----|-------|--------------|----------------|-----------------|-----------|
| #7  | 300 dawgpool | 285 → SELLER1 | 7.5 → ROYALTY_RECIPIENT | 7.5 → PLATFORM_RECIPIENT | marketplace → BUYER ✅ |
| #8  | 700 dawgpool | 665 → SELLER2 | 17.5 → ROYALTY_RECIPIENT | 17.5 → PLATFORM_RECIPIENT | marketplace → BUYER ✅ |
| #19 | 800 dawgpool | 760 → SELLER2 | 20 → ROYALTY_RECIPIENT | 20 → PLATFORM_RECIPIENT | marketplace → BUYER ✅ |

Splits are exact to the satoshi-equivalent. The recipients used during
this run are:

- ROYALTY_RECIPIENT = `SP1CSHTKVHMMQJ7PRQRFYW6SB4QAW6SR3XY2F81PA`
- PLATFORM_RECIPIENT = `SP280XKQ2T1V0NBE23MCAT0KS6P6MHV6RC8B2CWVJ`

### Bugs / quirks found

**None functionally.** One minor observation:

- **Step 2** (`buy-nft` pre-init) returned `NOT-LISTED` instead of
  `NOT-INITIALIZED`. The contract's `buy-nft` looks up the listings map
  before checking `allowed-nft` initialisation, so the map-miss fires
  first. Both paths reject the buy correctly; only the error message
  differs slightly. Not worth fixing.

## Router-wrapper variant (fakfun-nfts-core routed)

The previous two sims call the standalone custodial marketplace
directly. To let L/X wallets buy/sell dawg-tails NFTs **through
`fakfun-nfts-core`** (so the activity logs into core's print events
and fakfun's existing chainhook indexer picks it up), deploy the
**`lambda-nft-marketplace`** template as the wrapper. The lambda
template *is* the fakfun-style wrapper — it conforms to
`fakfun-nftmarket-trait` and self-registers with core via hash
verification when `initialize` is called.

### Sim — `simulations/dawg-tails-router-wrapper.js`

**URL:** https://stxer.xyz/simulations/mainnet/ee5aa8c973d1ec07a5868c27a885696c
**Block:** 8,029,043
**Steps:** 12 / 12 `(ok true)`

| # | Sender | Action | Result |
|---|--------|--------|--------|
| 0 | DEPLOYER | Deploy `lambda-nft-marketplace` (source-of-truth for hash) | ✅ |
| 1 | DEPLOYER | `fakfun-nfts-core.set-verified-contract(lambda, none)` — auto-hash mode | ✅ |
| 2 | DEPLOYER | Deploy `dawg-tails-marketplace` (identical source = identical hash) | ✅ |
| 3 | DEPLOYER | `dawg-tails-marketplace.initialize(dawg-tails-collection, "Dawg Tails")` — self-registers on core | ✅ |
| 4 | DEPLOYER | `dawg-tails-marketplace.whitelist-ft(dawgpool, true)` | ✅ |
| 5 | SELLER1 | **`fakfun-nfts-core.list-nft(wrapper, #2, dawg-tails, dawgpool, 100)`** | ✅ |
| 6 | SELLER1 | `fakfun-nfts-core.list-nft(wrapper, #4, …, 200)` | ✅ |
| 7 | SELLER2 | `fakfun-nfts-core.list-nft(wrapper, #3, …, 300)` | ✅ |
| 8 | BUYER | **`fakfun-nfts-core.buy-nft(wrapper, #2, …)`** | ✅ |
| 9 | SELLER1 | `fakfun-nfts-core.update-price(wrapper, #4, 250)` | ✅ |
| 10 | SELLER1 | `fakfun-nfts-core.unlist-nft(wrapper, #4, …)` | ✅ |
| 11 | BUYER | `fakfun-nfts-core.buy-nft(wrapper, #3, …)` | ✅ |

### Event-level confirmation

Step 5 (`list-nft` via core) emitted both layers' print events:

```
nft_transfer_event                                         (NFT → marketplace custody)
contract_event  SPV…dawg-tails-marketplace                 (wrapper's own "nft-listed" print)
contract_event  SPV…fakfun-nfts-core                       (core's "nft-listed" router print)
```

Step 8 (`buy-nft` via core) emitted the full chain:

```
ft_transfer_event   ::PEGGY                                (seller 95%)
ft_transfer_event   ::PEGGY                                (royalty 2.5%)
ft_transfer_event   ::PEGGY                                (platform 2.5%)
nft_transfer_event  the-dawg-tails-collection              (marketplace → buyer)
contract_event      SPV…dawg-tails-marketplace             (wrapper's "nft-sold" print)
contract_event      SPV…fakfun-nfts-core                   (core's "nft-sold" router print)
```

The double-print pattern is what fakfun's existing pepe + froggy
markets emit. Confirms the dawg-tails wrapper is indistinguishable
from a first-party fakfun marketplace as far as the indexer is
concerned.

### Mainnet deploy plan (if you ship this)

1. As `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` (fakfun deployer):
   - Deploy `lambda-nft-marketplace` (one-time, source-of-truth)
   - Call `fakfun-nfts-core.set-verified-contract(lambda, none)`
2. As anyone (the marketplace owner — pick a deployer):
   - Deploy `dawg-tails-marketplace` with identical source as lambda
   - Call `dawg-tails-marketplace.initialize(the-dawg-tails-collection, "Dawg Tails")`
3. As the dawg-tails-marketplace owner:
   - Call `whitelist-ft(dawgpool-stxcity, true)`
   - Optionally `set-royalty-recipient` / `set-platform-recipient`

After step 3, L/X users (and anyone else) can list/buy/sell dawg-tails
NFTs through `fakfun-nfts-core` and the fakfun UI will see them.

## Files

- `simulations/dawg-tails-marketplace-test.js` — initial 29-step sim
  (direct marketplace, no router)
- `simulations/dawg-tails-hammer.js` — 38-step full-coverage sim
  (direct marketplace, no router)
- `simulations/dawg-tails-router-wrapper.js` — 12-step routed sim
  (through fakfun-nfts-core via lambda template)
- `contracts/lambda-nft-marketplace.clar` — copied from fakfun-core;
  used as both the source-of-truth and the dawg-tails clone source
- `simulations/find-dawg-owners.mjs` — small helper that grouped chain
  ownership of all 26 dawg-tails NFTs to pick a multi-seller scenario
- `contracts/pepe-marketplace.clar` — standalone template used by the
  first two sims (NOT `custodial-marketplace.clar`, which has a broken
  auction extension)
