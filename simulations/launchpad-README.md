# NFT Launchpad — stxer verification

End-to-end mainnet-fork sims for the self-serve NFT marketplace launchpad.

## Template

[`contracts/custodialMarket/name-nft-market-faktory.clar`](../contracts/custodialMarket/name-nft-market-faktory.clar) — byte-identical clones of this source can self-register into `SPV9K21….fakfun-nfts-core` via the canonical-hash gate. Differs from the deployed `pepe-nft-marketplace` only by adding a `register-nft-marketplace` public function (owner-gated with FAK admin fallback).

## Sims

### 1. `launchpad-nft-trait-check.js` — Full list→buy roundtrip across 7 NFTs

For each candidate collection:
1. ADMIN deploys a marketplace clone of the template
2. ADMIN calls `initialize(<nft-principal>)`
3. ADMIN calls `whitelist-ft(PEPE, true)`
4. Real on-chain holder calls `list-nft(<token-id>, <nft>, PEPE, 10M PEPE)` — proves trait conformance + seller→marketplace NFT transfer
5. PEPE-rich buyer (`SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2`, ~421M PEPE) calls `buy-nft` — proves marketplace→buyer NFT return + 95/2.5/2.5 PEPE splits

| Collection | NFT contract | Token | Holder | Verdict |
|---|---|---|---|---|
| leo-cats | `SP2N959SER36FZ5QT1CX9BR63W3E8X35WQCMBYYWC.leo-cats` | #5000 | `SP1DABD9JN312E3HG1VM3ES8RD725CBK8CE2Q5FX1` | ✅ |
| miami-degens | `SP1SCEXE6PMGPAC6B4N5P2MDKX8V4GF9QDE1FNNGJ.miami-degens` | #50 | `SP3SKH6YB515J76KVDHDHBTE2GQ4CV6QJHC5GJKRF` | ✅ |
| drone-wars-uaps | `SP1AQ0YQEXE9VADX3TY7H1K9767ZD1KCPXAD3J489.drone-wars-uaps` | #1 | `SP2SBQB02XBSPKZBJW7WY5069Q455KJPQ9EET6F4H` | ✅ |
| deruptars | `SP2KAF9RF86PVX3NEE27DFV1CQX0T4WGR41X3S45C.deruptars` | #1 | `SP3WAR3N1XRR139DXCGPR1ATPK2VN63PGRXTD537N` | ✅ |
| stacks-pops | `SPJW1XE278YMCEYMXB8ZFGJMH8ZVAAEDP2S2PJYG.stacks-pops` | #500 | `SP1SKX73V3WGEW5RVK482NGT1ER0879CVXQB23FZV` | ✅ |
| saints | `SP207ESW7AKHTPRYAAD9QP8Q1TE1F57D2S8RGPJCC.saints` | #1 | `SP1HRK5ZWS3DC0KVSKK7GF32KYJ0TGDE90KXDFC3H` | ✅ |
| early-eagles-v2 | `SP35A2J9JBTPSS9WA9XZAPRX8FB3245XXG7CZ0ZM2.early-eagles-v2` | #1 | `SPKH9AWG0ENZ87J1X0PBD4HETP22G8W22AFNVF8K` | ✅ |

**Latest run**: https://stxer.xyz/simulations/mainnet/0ae753419b0176ca5649739e12911833

35/35 steps green · 0 VM errors · 0 post-condition aborts · 21 FT transfer events (7×3 splits) · 14 NFT transfer events (7 list + 7 buy) · 30 contract print events.

Sample of PEPE splits for one buy (10M PEPE list price, 3 decimals):
```
9,500,000,000 µPEPE → seller          (95%)
  250,000,000 µPEPE → SPV9K21… (royalty,  2.5%)
  250,000,000 µPEPE → SPV9K21… (platform, 2.5%)
```

### Known gotcha — non-custodial Gamma-style market gate

`leo-cats` (and a few others built on the same template) gate `transfer` with `(asserts! (is-none (map-get? market id)) (err ERR-LISTING))`. If the token is currently listed on the collection's own built-in non-custodial market, `transfer` returns `(err u106)`. **Same as bitcoin-pepe** — the existing `PepeMarketplace.tsx` ships without any preemptive check; the user simply unlists from Gamma first if they hit it. No special handling needed in the launchpad UI.

### 2. `launchpad-self-serve-saints.js` — End-to-end self-serve registration

Proves the trustless self-serve registration flow works using saints as the user-deployed collection.

1. FAK admin deploys `template-nft-market-faktory` (canonical reference)
2. FAK admin calls `set-verified-contract(<template>, none)` — registry fetches the on-chain hash via `contract-hash?`
3. User deploys `saints-nft-market-faktory` with byte-identical source
4. User calls `initialize(saints)`
5. User whitelists sBTC
6. User calls `register-nft-marketplace(<template>, "saints")` → fakfun-nfts-core compares caller's hash to verified hash → match → registered
7. Verify: `is-marketplace-registered` returns true + `get-marketplace-info` returns the tuple
8. Saints holder lists token #1 through `fakfun-nfts-core.list-nft` (the central proxy that emits the unified `nft-listed` event)

**Latest run**: https://stxer.xyz/simulations/mainnet/6517f1a9eddaf9f073ff8c3d5dcbd8fa

9/9 steps green · `is-marketplace-registered` = `true` · `get-marketplace-info` = `(some (tuple (creation-height u950260) (name "saints") (nft-contract …saints)))`.

## How to re-run

```bash
cd /home/raphastacks/projects/fakfun/contracts/custodial-nft-marketplace

# Full list→buy roundtrip for all 7 NFTs
node simulations/launchpad-nft-trait-check.js
node simulations/launchpad-decode-results.mjs <sessionId-from-previous-line>

# Self-serve registration flow
node simulations/launchpad-self-serve-saints.js
node simulations/launchpad-self-serve-decode.mjs <sessionId-from-previous-line>
```

Sims take ~30-60s each. Decoders hit `https://api.stxer.xyz/simulations/{id}` (v1 endpoint — the v2 `/devtools/v2/...` returns 400 for fresh sessions; v1 returns the full step receipts immediately once processed).

## Adding a new collection

Edit the `TESTS` array in `launchpad-nft-trait-check.js`:

```js
{ mkt: "<slug>-mkt", nft: ["<deployer>", "<contract-name>"], tokenId: <known-held-id>, holder: "<holder-stx>" },
```

To find a holder for any SIP-009 NFT: call `get-owner` on a token ID via the Hiro API, decode the Clarity result (use `cvToString(deserializeCV(hex))` with `@stacks/transactions`). Avoid token IDs currently held by marketplace contracts — pick one whose owner is an EOA (standard principal, hex prefix `0x070a0516…`, not the contract-principal prefix `0x070a0616…`).

## stxer SDK 0.8.0 notes (errors / quirks observed)

Across the latest runs (35-step full roundtrip + 9-step self-serve), **no SDK errors hit**, but a few behaviors are worth knowing:

- **`clarity_version` defaults to `Clarity5`** for deploys. The marketplace template is Clarity 4 (matches deployed `pepe-nft-marketplace`) — pass explicitly: `clarity_version: ClarityVersion.Clarity4`.
- **U64/U128 fields widened to `number | string`** in receipts (`stx_burned`, all `execution_cost.*`, tip metadata). Normalize with `BigInt(...)` or `Number(...)` before arithmetic if you parse them.
- **Receipt events are JSON-encoded strings, not parsed objects.** To filter, run `fromjson` first then check `.type` ∈ `{contract_event, ft_transfer_event, nft_transfer_event}`. Example:
  ```bash
  jq -r '.result.steps[].receipt.events[]? | fromjson |
         select(.type == "ft_transfer_event") |
         "\(.ft_transfer_event.amount) → \(.ft_transfer_event.recipient)"' raw.json
  ```
- **v2 API endpoint `/devtools/v2/simulations/{id}` returns 400 with `failed to read metadata` for fresh simulations**. Use the v1 `/simulations/{id}` endpoint instead — it returns the full receipt tree once processing finishes.
- **`as-contract` is not available** at the Clarity 4 epoch used here (`use of unresolved function 'as-contract'` at deploy time). Use `as-contract?` with capability annotations, OR avoid `as-contract` entirely when `contract-caller` is already what you need (it's auto-set to the calling contract by `contract-call?`).
- **Use `addAdvanceBlocks`** for any future flow needing burn-block advancement (e.g., timelocks). Not used by the current launchpad sims.

No 0.8 errors observed in latest runs.
