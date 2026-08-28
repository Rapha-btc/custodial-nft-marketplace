# Custodial NFT Marketplace

A Clarity 4 custodial NFT marketplace contract supporting fungible token (FT) payments. Built for Bitcoin Pepe NFTs with PEPE token payments.

## Features

- **Custodial listings**: NFTs are held by the contract while listed
- **FT payments**: Pay with whitelisted fungible tokens (e.g., PEPE token)
- **Reusable**: Same bytecode works for any NFT collection (deployer sets NFT contract once)
- **Fee system**: Configurable royalty (2.5%) and platform fee (2.5%)
- **Admin controls**: Pause, whitelist FTs, emergency returns
- **Clarity 4**: Uses `as-contract?` with `with-nft` allowances, `current-contract`

## Contract Functions

### Admin Functions
| Function | Description |
|----------|-------------|
| `initialize` | Set the allowed NFT contract (one-time) |
| `whitelist-ft` | Add/remove FT contracts for payments |
| `set-paused` | Pause/unpause marketplace |
| `set-royalty-percent` | Set royalty % (max 10%) |
| `set-royalty-recipient` | Set royalty recipient |
| `set-platform-fee` | Set platform fee % (max 5%) |
| `set-platform-recipient` | Set platform recipient |
| `admin-emergency-return` | Return NFT to seller in emergencies |

### User Functions
| Function | Description |
|----------|-------------|
| `list-nft` | List NFT for sale (transfers to contract) |
| `unlist-nft` | Cancel listing (returns NFT to seller) |
| `update-price` | Update listing price |
| `update-listing-ft` | Change payment token and price |
| `buy-nft` | Purchase listed NFT |

### Read Functions
| Function | Description |
|----------|-------------|
| `get-listing` | Get listing details by token-id |
| `is-ft-whitelisted` | Check if FT is whitelisted |
| `get-allowed-nft` | Get the allowed NFT contract |
| `get-royalty-info` | Get royalty % and recipient |
| `get-platform-info` | Get platform fee % and recipient |
| `is-paused` | Check if contract is paused |
| `is-initialized` | Check if contract is initialized |

## Fee Structure

On each sale:
- **Seller receives**: 95%
- **Royalty (artist)**: 2.5%
- **Platform fee**: 2.5%

## Simulation Results

- **Main simulation**: [View on Stxer](https://stxer.xyz/simulations/mainnet/e28e0dfc2f43dbf2e457699d122f0930)
- **Edge case simulation**: [View on Stxer](https://stxer.xyz/simulations/mainnet/9bd9ee1d293584be5f505a2cb2de8e29)
- **FT un-whitelist test**: [View on Stxer](https://stxer.xyz/simulations/mainnet/994deff93fcf015b51380eaac09029f8)

### Test Participants
| Role | Address |
|------|---------|
| Deployer/Admin | `SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22` |
| Seller (NFT owner) | `SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP` |
| Buyer (421M PEPE) | `SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2` |

### Contracts Used
| Contract | Address |
|----------|---------|
| Bitcoin Pepe NFT | `SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe` |
| PEPE Token | `SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.tokensoft-token-v4k68639zxz` |

### Happy Path Tests

| Step | Action | Result |
|------|--------|--------|
| 1 | Deploy contract | Success |
| 2 | Initialize with bitcoin-pepe | `(ok true)` |
| 3 | Whitelist PEPE token | `(ok true)` |
| 4 | List NFT #137 for 10M PEPE | `(ok true)` - NFT transferred to contract |
| 5 | Buy NFT #137 | `(ok true)` - 9.5M to seller, 250K royalty, 250K platform |
| 6 | List NFT #139 | `(ok true)` |
| 7 | Unlist NFT #139 | `(ok true)` - NFT returned to seller |
| 8 | List NFT #178 at 50M | `(ok true)` |
| 9 | Update price to 100M | `(ok true)` |
| 10 | List NFT #267 | `(ok true)` |
| 11 | Update listing FT | `(ok true)` |

### Security Tests (Expected Failures)

| Step | Attack Vector | Result | Error |
|------|--------------|--------|-------|
| 12 | List with non-whitelisted FT | `(err u204)` | ERR-FT-NOT-WHITELISTED |
| 14 | Buy with insufficient funds (422M price, 421M balance) | `(err u1)` | FT transfer failed (external) |
| 15 | Buy own NFT | `(err u206)` | ERR-CANNOT-BUY-OWN |
| 16 | Unlist someone else's NFT | `(err u203)` | ERR-NOT-OWNER |
| 17 | Buy with wrong FT contract | `(err u211)` | ERR-WRONG-FT |
| 18 | Initialize twice | `(err u209)` | ERR-ALREADY-INITIALIZED |
| 19 | Non-admin whitelist FT | `(err u200)` | ERR-NOT-AUTHORIZED |
| 20 | Non-admin pause | `(err u200)` | ERR-NOT-AUTHORIZED |
| 22 | Buy when paused | `(err u207)` | ERR-PAUSED |
| 24 | List NFT already on Gamma | `(err u106)` | NFT locked in Gamma listing (external) |

### Admin Functions Tests

| Step | Action | Result |
|------|--------|--------|
| 21 | Admin pause | `(ok true)` |
| 23 | Admin unpause | `(ok true)` |
| 25 | Admin emergency return #274 | `(ok true)` - NFT returned to seller |

### Final Purchase Test

| Step | Action | Result |
|------|--------|--------|
| 26 | Buy NFT #178 at updated price (100M) | `(ok true)` |

**Fee breakdown for 100M PEPE sale:**
- Seller receives: 95M PEPE (95%)
- Royalty: 2.5M PEPE (2.5%)
- Platform: 2.5M PEPE (2.5%)

---

## Edge Case Tests (51 steps)

### Pre-Initialization Tests
| Step | Test | Result |
|------|------|--------|
| 2 | List before initialize | `(err u210)` ERR-NOT-INITIALIZED |
| 3 | Buy before initialize | `(err u202)` ERR-NOT-LISTED |

### Wrong NFT Contract Tests
| Step | Test | Result |
|------|------|--------|
| 7 | List with wrong NFT (leo-cats) | `(err u208)` ERR-WRONG-NFT |
| 9 | Buy with wrong NFT | `(err u208)` ERR-WRONG-NFT |
| 10 | Unlist with wrong NFT | `(err u208)` ERR-WRONG-NFT |

### Double Actions
| Step | Test | Result |
|------|------|--------|
| 11 | Initialize twice | `(err u209)` ERR-ALREADY-INITIALIZED |
| 12 | List already-listed NFT | `(err u201)` ERR-ALREADY-LISTED |

### Invalid Parameters
| Step | Test | Result |
|------|------|--------|
| 13 | List with price = 0 | `(err u205)` ERR-INVALID-PRICE |
| 14 | Update price to 0 | `(err u205)` ERR-INVALID-PRICE |
| 15 | Set royalty > 10% | `(err u200)` ERR-NOT-AUTHORIZED |
| 16 | Set platform fee > 5% | `(err u200)` ERR-NOT-AUTHORIZED |

### Non-Existent Listings
| Step | Test | Result |
|------|------|--------|
| 17 | Buy non-existent #9999 | `(err u202)` ERR-NOT-LISTED |
| 18 | Unlist non-existent #9999 | `(err u202)` ERR-NOT-LISTED |
| 19 | Update price on #9999 | `(err u202)` ERR-NOT-LISTED |
| 20 | Emergency return #9999 | `(err u202)` ERR-NOT-LISTED |

### Permission Tests
| Step | Test | Result |
|------|------|--------|
| 21 | Non-admin emergency return | `(err u200)` ERR-NOT-AUTHORIZED |
| 22 | Non-owner update price | `(err u203)` ERR-NOT-OWNER |
| 23 | Non-owner update listing FT | `(err u203)` ERR-NOT-OWNER |
| 24-27 | Non-admin set royalty/platform | `(err u200)` ERR-NOT-AUTHORIZED |

### Wrong Whitelisted FT Tests
| Step | Test | Result |
|------|------|--------|
| 28 | Buy with wrong FT (notastrategy vs PEPE) | `(err u211)` ERR-WRONG-FT |
| 30 | Buy with wrong FT (PEPE vs notastrategy) | `(err u211)` ERR-WRONG-FT |

### Stale Listing Tests
| Step | Test | Result |
|------|------|--------|
| 31-32 | List #178, then unlist | `(ok true)` |
| 33 | Buy after unlist | `(err u202)` ERR-NOT-LISTED |

### Price Update Tests
| Step | Test | Result |
|------|------|--------|
| 34 | List #267 at 10M | `(ok true)` |
| 35 | Update price to 50M | `(ok true)` |
| 36 | Buy at updated price | `(ok true)` - pays 50M (47.5M seller, 1.25M royalty, 1.25M platform) |

### Paused Contract Tests
| Step | Test | Result |
|------|------|--------|
| 39 | List when paused | `(err u207)` ERR-PAUSED |
| 40 | Buy when paused | `(err u207)` ERR-PAUSED |
| 41 | Update price when paused | `(err u207)` ERR-PAUSED |
| 42 | Update listing FT when paused | `(err u207)` ERR-PAUSED |
| 43 | **Unlist when paused** | `(ok true)` - seller can always reclaim |
| 44 | **Admin emergency return when paused** | `(ok true)` - admin recovery works |

### Post-Unpause Tests
| Step | Test | Result |
|------|------|--------|
| 46 | List #335 after unpause | `(ok true)` |
| 47 | Buy #335 | `(ok true)` - 9.5M seller, 250K royalty, 250K platform |
| 48 | Buy again after sold | `(err u202)` ERR-NOT-LISTED |

### Post Emergency Return Tests
| Step | Test | Result |
|------|------|--------|
| 48 | Buy after emergency return | `(err u202)` ERR-NOT-LISTED |

---

## FT Un-Whitelist Tests (12 steps)

Tests that un-whitelisting an FT blocks purchases but sellers can still reclaim their NFTs.

| Step | Action | Result | Notes |
|------|--------|--------|-------|
| 1 | Deploy contract | Success | |
| 2 | Initialize with bitcoin-pepe | `(ok true)` | |
| 3 | Whitelist PEPE token | `(ok true)` | |
| 4 | Seller lists NFT #137 | `(ok true)` | NFT transferred to contract |
| 5 | Admin un-whitelists PEPE | `(ok true)` | |
| 6 | **Buyer tries to buy** | `(err u204)` | ERR-FT-NOT-WHITELISTED - blocked! |
| 7 | **Seller unlists** | `(ok true)` | Seller can always reclaim NFT |
| 8 | Admin re-whitelists PEPE | `(ok true)` | |
| 9 | Seller lists NFT #137 again | `(ok true)` | |
| 10 | Buyer buys NFT #137 | `(ok true)` | Works after re-whitelist |
| 11 | Admin un-whitelists PEPE | `(ok true)` | |
| 12 | **Seller tries to list #139** | `(err u204)` | New listings also blocked |

**Key behaviors verified:**
- Purchases blocked when FT is un-whitelisted (protects buyers)
- Sellers can always unlist and reclaim NFTs (prevents lockup)
- New listings blocked with un-whitelisted FTs
- Purchases work again after FT is re-whitelisted

---

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| u200 | ERR-NOT-AUTHORIZED | Caller is not admin |
| u201 | ERR-ALREADY-LISTED | Token already listed |
| u202 | ERR-NOT-LISTED | Token not listed |
| u203 | ERR-NOT-OWNER | Caller is not listing owner |
| u204 | ERR-FT-NOT-WHITELISTED | FT not whitelisted |
| u205 | ERR-INVALID-PRICE | Price must be > 0 |
| u206 | ERR-CANNOT-BUY-OWN | Cannot buy own listing |
| u207 | ERR-PAUSED | Contract is paused |
| u208 | ERR-WRONG-NFT | Wrong NFT contract |
| u209 | ERR-ALREADY-INITIALIZED | Already initialized |
| u210 | ERR-NOT-INITIALIZED | Not initialized |
| u211 | ERR-WRONG-FT | Wrong FT contract for listing |

## Clarity 4 Features Used

```clarity
;; Get contract principal (replaces as-contract tx-sender)
current-contract

;; Block height
stacks-block-height

;; Safe asset transfers with allowances
(as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
  (try! (contract-call? nft-contract transfer token-id current-contract recipient)))
```

## Running Simulations

```bash
# Install dependencies
npm install

# Run main simulation
npm run simul

# Run edge case simulation
npm run simul:edge

# Run FT un-whitelist test
node simulations/ft-unwhitelist-test.js
```

## Deployment

1. Deploy contract
2. Call `initialize` with NFT contract principal
3. Call `whitelist-ft` for each payment token
4. Set royalty/platform recipients if different from deployer

```clarity
;; Example initialization
(contract-call? .pepe-marketplace initialize 'SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe)
(contract-call? .pepe-marketplace whitelist-ft 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.tokensoft-token-v4k68639zxz true)
```

## License

MIT

## fakfun-collection-bids: the `"*"` asset wildcard in `with-ft`

`fakfun-collection-bids.clar` pays out of escrow with

```clarity
(as-contract? ((with-ft (contract-of ft) "*" amount)) ...)
```

The `"*"` grants the callee an allowance of up to `amount` for ANY fungible
token defined by that contract, not one named asset. A contract that defines
several SIP-010 tokens (or a malicious one that defines a decoy) could move a
different asset than the one escrowed, up to `amount`.

This is safe here only because payment tokens are admin-whitelisted
(`whitelist-ft`; sBTC and PEPE at deploy). Rules that keep it safe:

- Whitelist only contracts that define exactly one fungible token.
- Read the contract before whitelisting. `define-fungible-token` must appear
  once.
- Never make the FT whitelist permissionless.

Passing the asset name explicitly would close this without the whitelist, at
the cost of an extra argument on every bid, cancel, re-price and fill. Not
worth it while the whitelist holds.

### Rule: only real collections get whitelisted

`accept-bid` calls the collection's `transfer` and trusts its result. It does
not check the owner before, and it does not re-read `get-owner` after. Both
checks were removed on purpose:

- Before: redundant. A real SIP-009 contract refuses to move a token the
  caller does not own (Bitcoin Pepe returns `err u1`).
- After: only matters for a FAKE collection whose `transfer` returns `ok`
  without moving the token. That contract would be paid out of escrow.

So the safety of every fill rests on one rule, the same one the FT wildcard
above rests on: **`set-collection` is only ever called for real, audited
SIP-009 contracts.** We are not going to list fake ones. Read the
collection's `transfer` before whitelisting, the same way an FT's
`define-fungible-token` is read before `whitelist-ft`.

`simulations/collection-bids-edge-cases.js` keeps a deliberately lying NFT in
the run so this assumption stays visible in the test output.

## Collection bids: stxer simulation record

Both bids contracts are verified with self-checking stxer harnesses in
`simulations/` (each step's decoded result is asserted, plus balance deltas).
Run any of them with `node simulations/<file>` (needs `stxer` 0.8.0+; the
repo's `node_modules/stxer` may be symlinked to a newer copy).

| Contract | Harness | Checks | Simulation |
|---|---|---|---|
| `fakfun-collection-bids` (FT: sBTC, PEPE) - pre-deploy source | `collection-bids-test.js` | 52/52 | https://stxer.xyz/simulations/mainnet/ab003924942312a86dd79d2aa5c0d0e7 |
| `fakfun-collection-bids` - pre-deploy source | `collection-bids-edge-cases.js` | 81/81 | https://stxer.xyz/simulations/mainnet/b693cb46eb5962be5401c864b0a25f65 |
| `SPV9K21….fakfun-collection-bids-stx` - DEPLOYED mainnet contract | `collection-bids-stx-test.js` | 42/42 | https://stxer.xyz/simulations/mainnet/c6ca39a8178e581507fe8723fcb0e328 |
| `SPV9K21….fakfun-collection-bids-stx` - DEPLOYED mainnet contract | `collection-bids-stx-edge-cases.js` | 70/70 | https://stxer.xyz/simulations/mainnet/4f376adf1ffca428bf4a5ccef9119ca6 |

The STX harnesses run against the live contract at mainnet tip (no deploy
step) and derive bid ids from `get-last-bid-id`, so they keep working as real
bids land. Rendezvous fuzzing (`rendezvous/`, `npm`-less: `scripts/rv-sync.sh`
then `rv . fakfun-collection-bids invariant|test`) covers the FT contract:
escrow == sum(price x remaining), no zero-remaining bids, fee caps, pending
admin != current admin; property tests re-assert those after every action.

### What is covered

- Admin: only the `fakfun` var (not the deployer); propose / accept handover
  with the 144 burn block cooldown (one block short still refused), overwrite
  and cancel of a proposal, old admin locked out after handover; fee and
  royalty caps; pause blocks place / fill / re-price but never cancel.
- Bids: place (zero price, quantity cap, unknown collection, insufficient
  funds), fill (own bid refused, non-owner refused by the NFT contract, wrong
  NFT contract, quantity decrements and deletion at zero), re-price up and
  down with escrow tracked at every step, cancel and double cancel, partial
  fill then re-price then cancel arithmetic, dust prices whose fees round to
  zero, zero-fee configuration, fee and royalty changes while bids are open.
- Real-world NFT states: Gamma-listed token (NFT contract's `u106`), token
  escrowed on our own marketplace (must be unlisted first), a whitelisted
  collection disabled with a bid open (cancel still refunds).
- Hostile inputs: `price x quantity` above u128 aborts with no state change;
  a re-price whose escrow fits u128 fails on funds, not on arithmetic; a
  lying NFT whose `transfer` is a no-op (documents the whitelist rule above).
- Invariant at the end of every harness: the contract's token balance is
  exactly what it started with.

### Findings

1. Fixed before deploy (FT contract): `accept-bid` looked the collection up
   by the passed NFT trait instead of the bid's stored collection, so a wrong
   NFT argument surfaced as `u302` and the royalty could in principle be read
   from a different collection than the one bid on. Now keyed on the bid.
2. Admin footgun, STX contract (not user-exploitable, no funds at risk): if
   `royalty-recipient` or `platform-recipient` is set to the bids contract's
   own principal, `stx-transfer?` refuses the self-transfer (`err u2`) and
   every fill on that collection reverts until the recipient is fixed. Bids
   stay open and cancellable. Never point a recipient at the contract.
3. No path lets the admin move escrow: the only `stx-transfer?` /
   `ft transfer` sites are inside `place-bid`, `cancel-bid`,
   `update-bid-price` and `accept-bid`, each bound to the bid's own numbers.
