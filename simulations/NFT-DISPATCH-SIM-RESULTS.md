# nft-dispatch mainnet-fork results (2026-11-17)

46 passed, 0 failed: https://stxer.xyz/simulations/mainnet/593ab224a1bd549892ebe0b173fb258a

Run: `npm run simul:dispatch`. Real holder SP3WAA… moved real bitcoin-pepe, giga-pepe-v2, stacks-invaders-v0, and roo-cards NFTs.

- send-many: 3 pepes to 2 recipients in one tx
- send-many-to: 4 giga-pepes to 1 recipient in one tx
- send-multi-to: 3 collections (6 NFTs) to 1 recipient in one tx
- atomic: an owned id plus an unowned id -> err u1, and nothing moves
- guards: empty list u100, self-send u101, a stranger moving someone else's NFTs is rejected by the collection

**BNS-V2 rejects the batch call (err u102)** because its transfer is not callable through a contract. The FE must keep BNS names out of the batch.
