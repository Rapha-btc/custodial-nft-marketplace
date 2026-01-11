# Security Assessment

## Overview

This document outlines the security model, known risks, and mitigations for the custodial NFT marketplace contract.

## No Critical Vulnerabilities Found

The contract has been reviewed and tested with 60+ simulation steps covering happy paths, edge cases, and attack vectors.

## Safe by Design

| Concern | Status | Reason |
|---------|--------|--------|
| Re-entrancy | Safe | Clarity has no callbacks, transactions are atomic |
| Integer overflow | Safe | Clarity uses 128-bit integers with safe math |
| NFT theft by admin | Safe | Admin can only return NFTs to original sellers |
| Token ID collision | Safe | Single NFT contract enforced |
| Partial execution | Safe | All `try!` failures revert entire transaction |
| FT un-whitelist rug | Safe | Purchases blocked, but sellers can always unlist |

## Access Control

| Action | Who Can Do It |
|--------|---------------|
| List NFT | NFT owner only |
| Unlist NFT | Original seller only |
| Update price | Original seller only |
| Update listing FT | Original seller only |
| Buy NFT | Anyone (except seller) |
| Pause/unpause | Admin only |
| Whitelist FT | Admin only |
| Set fees | Admin only |
| Emergency return | Admin only (returns to seller) |

## Fee Caps (Mitigated Risk)

Admin can change fees, but they are capped:

| Fee Type | Maximum | Default |
|----------|---------|---------|
| Royalty | 10% (u1000) | 2.5% (u250) |
| Platform | 5% (u500) | 2.5% (u250) |
| **Total Max** | **15%** | **5%** |

Even if admin maximizes fees, seller receives at least 85% of sale price.

## What Admin CAN Do

- Pause/unpause the marketplace
- Whitelist/un-whitelist FT payment tokens
- Change royalty percent (max 10%)
- Change platform fee (max 5%)
- Change royalty recipient
- Change platform recipient
- Emergency return NFTs to their original sellers

## What Admin CANNOT Do

- Steal NFTs (can only return to original seller)
- Steal buyer's FT (transfers go directly to seller/recipients)
- Lock NFTs permanently (seller can always unlist, even when paused)
- Exceed fee caps (15% max total)
- Re-initialize the contract
- Change the allowed NFT contract after initialization

## Seller Protections

1. **Only seller can unlist** - No one else can remove your listing
2. **Unlist works when paused** - Seller can always reclaim NFT
3. **Unlist works when FT un-whitelisted** - Seller not locked out
4. **Emergency return goes to seller** - Admin cannot redirect NFTs

## Buyer Protections

1. **Atomic transactions** - If any step fails, entire purchase reverts
2. **FT whitelist check on buy** - Cannot purchase with deprecated tokens
3. **Wrong FT rejected** - Must use exact FT specified in listing
4. **Cannot buy own listing** - Prevents wash trading fees

## Known Acceptable Risks

### 1. Admin Centralization
Single admin (deployer) controls all admin functions. If admin key is compromised:
- Attacker can pause marketplace (disruption)
- Attacker can change fee recipients (steal future fees)
- Attacker can un-whitelist FTs (disrupt sales, but sellers can unlist)
- Attacker CANNOT steal existing NFTs or FTs

**Mitigation:** Secure admin key management. Consider multi-sig for production.

### 2. Fee Changes Mid-Listing
Admin can change fees while NFTs are listed:
- Seller lists expecting 5% fees
- Admin raises to 15%
- Next buyer pays higher fees, seller gets less

**Mitigation:** Fee caps limit maximum damage to 15%.

### 3. Front-Running
Miners/block producers could theoretically front-run transactions. This is inherent to blockchain, not specific to this contract.

### 4. Rounding Dust
Integer division loses fractions:
- 100 tokens at 2.5% = 2.5 rounds to 2
- Dust goes to seller (favors sellers slightly)

**Mitigation:** Standard behavior, economically negligible.

## Tested Attack Vectors

All attacks properly rejected:

| Attack | Result | Error |
|--------|--------|-------|
| List with non-whitelisted FT | Blocked | ERR-FT-NOT-WHITELISTED (u204) |
| Buy with wrong FT | Blocked | ERR-WRONG-FT (u211) |
| Buy own listing | Blocked | ERR-CANNOT-BUY-OWN (u206) |
| Unlist someone else's NFT | Blocked | ERR-NOT-OWNER (u203) |
| Non-admin pause | Blocked | ERR-NOT-AUTHORIZED (u200) |
| Non-admin whitelist | Blocked | ERR-NOT-AUTHORIZED (u200) |
| Initialize twice | Blocked | ERR-ALREADY-INITIALIZED (u209) |
| List wrong NFT contract | Blocked | ERR-WRONG-NFT (u208) |
| Buy when paused | Blocked | ERR-PAUSED (u207) |
| Set royalty > 10% | Blocked | ERR-NOT-AUTHORIZED (u200) |
| Set platform fee > 5% | Blocked | ERR-NOT-AUTHORIZED (u200) |
| Buy with un-whitelisted FT | Blocked | ERR-FT-NOT-WHITELISTED (u204) |

## Simulation Results

All security tests pass:
- [Main simulation (26 steps)](https://stxer.xyz/simulations/mainnet/e28e0dfc2f43dbf2e457699d122f0930)
- [Edge cases (51 steps)](https://stxer.xyz/simulations/mainnet/9bd9ee1d293584be5f505a2cb2de8e29)
- [FT un-whitelist test (12 steps)](https://stxer.xyz/simulations/mainnet/994deff93fcf015b51380eaac09029f8)

## Recommendations for Production

1. **Secure admin key** - Use hardware wallet or multi-sig
2. **Monitor events** - Watch for unexpected admin actions
3. **Communicate fee changes** - Notify users before changing fees
4. **Whitelist carefully** - Only add trusted FT contracts
