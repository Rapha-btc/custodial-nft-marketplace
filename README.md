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

Full simulation results: **[View on Stxer](https://stxer.xyz/simulations/mainnet/ccdd850f13bcb7727a2a4f00e17fbfd4)**

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
| 12 | List with non-whitelisted FT | `(err u105)` | ERR-FT-NOT-WHITELISTED |
| 14 | Buy with insufficient funds (422M price, 421M balance) | `(err u1)` | FT transfer failed |
| 15 | Buy own NFT | `(err u108)` | ERR-CANNOT-BUY-OWN |
| 16 | Unlist someone else's NFT | `(err u104)` | ERR-NOT-OWNER |
| 17 | Buy with wrong FT contract | `(err u113)` | ERR-WRONG-FT |
| 18 | Initialize twice | `(err u111)` | ERR-ALREADY-INITIALIZED |
| 19 | Non-admin whitelist FT | `(err u100)` | ERR-NOT-AUTHORIZED |
| 20 | Non-admin pause | `(err u100)` | ERR-NOT-AUTHORIZED |
| 22 | Buy when paused | `(err u109)` | ERR-PAUSED |
| 24 | List NFT already on Gamma | `(err u106)` | NFT locked in Gamma listing |

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

## Error Codes

| Code | Constant | Description |
|------|----------|-------------|
| u100 | ERR-NOT-AUTHORIZED | Caller is not admin |
| u101 | ERR-NOT-FOUND | Resource not found |
| u102 | ERR-ALREADY-LISTED | Token already listed |
| u103 | ERR-NOT-LISTED | Token not listed |
| u104 | ERR-NOT-OWNER | Caller is not listing owner |
| u105 | ERR-FT-NOT-WHITELISTED | FT not whitelisted |
| u106 | ERR-TRANSFER-FAILED | Transfer failed |
| u107 | ERR-INVALID-PRICE | Price must be > 0 |
| u108 | ERR-CANNOT-BUY-OWN | Cannot buy own listing |
| u109 | ERR-PAUSED | Contract is paused |
| u110 | ERR-WRONG-NFT | Wrong NFT contract |
| u111 | ERR-ALREADY-INITIALIZED | Already initialized |
| u112 | ERR-NOT-INITIALIZED | Not initialized |
| u113 | ERR-WRONG-FT | Wrong FT contract for listing |

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
