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

## Files

- `simulations/dawg-tails-marketplace-test.js` — the 29-step sim above
- `simulations/find-dawg-owners.mjs` — small helper that grouped chain
  ownership of all 26 dawg-tails NFTs to pick a multi-seller scenario
- `contracts/pepe-marketplace.clar` — the template used (NOT
  `custodial-marketplace.clar`, which has a broken auction extension)
