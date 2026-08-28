(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant MAX-INCREMENT-BPS u1000)
(define-constant MAX-INCREMENT-ABS u100000000)
(define-constant MIN-DURATION u1)
(define-constant MAX-DURATION u1008)
(define-constant MAX-SNIPE-WINDOW u36)

(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-PAUSED (err u301))
(define-constant ERR-COLLECTION-NOT-WHITELISTED (err u302))
(define-constant ERR-INVALID-PRICE (err u304))
(define-constant ERR-WRONG-NFT (err u308))
(define-constant ERR-CANNOT-FILL-OWN (err u311))
(define-constant ERR-FEE-TOO-HIGH (err u313))
(define-constant ERR-BID-TOO-LOW (err u320))
(define-constant ERR-AUCTION-NOT-FOUND (err u322))
(define-constant ERR-AUCTION-ENDED (err u323))
(define-constant ERR-AUCTION-LIVE (err u324))
(define-constant ERR-INVALID-DURATION (err u325))
(define-constant ERR-HAS-BIDS (err u326))
(define-constant ERR-NOT-SELLER (err u327))

(define-data-var min-increment-bps uint u200)
(define-data-var min-increment-abs uint u1000000)
(define-data-var snipe-window uint u3)
(define-data-var auction-nonce uint u0)

(define-map auctions
  uint
  {
    seller: principal,
    nft-contract: principal,
    token-id: uint,
    reserve: uint,
    ends-at: uint,
    top-bidder: (optional principal),
    top-amount: uint,
    created-at: uint,
  }
)

(define-private (is-admin)
  (is-eq tx-sender (contract-call? .fakfun-market-registry get-fakfun))
)

(define-private (log
    (event (string-ascii 24))
    (nft-contract principal)
    (token-id uint)
    (id uint)
    (actor principal)
    (counterparty (optional principal))
    (price uint)
    (royalty uint)
    (platform-fee uint)
    (ref uint)
  )
  (contract-call? .fakfun-market-registry log event nft-contract token-id id
    actor counterparty price royalty platform-fee ref
  )
)

(define-public (set-min-increment
    (bps uint)
    (abs uint)
  )
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (asserts! (and (<= bps MAX-INCREMENT-BPS) (<= abs MAX-INCREMENT-ABS))
      ERR-FEE-TOO-HIGH
    )
    (var-set min-increment-bps bps)
    (var-set min-increment-abs abs)
    (print {
      event: "min-increment-updated",
      bps: bps,
      abs: abs,
    })
    (ok true)
  )
)

(define-public (set-snipe-window (blocks uint))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (asserts! (and (> blocks u0) (<= blocks MAX-SNIPE-WINDOW))
      ERR-INVALID-DURATION
    )
    (var-set snipe-window blocks)
    (print {
      event: "snipe-window-updated",
      blocks: blocks,
    })
    (ok true)
  )
)

(define-read-only (get-snipe-window)
  (var-get snipe-window)
)

(define-read-only (min-next-bid (auction {
  seller: principal,
  nft-contract: principal,
  token-id: uint,
  reserve: uint,
  ends-at: uint,
  top-bidder: (optional principal),
  top-amount: uint,
  created-at: uint,
}))
  (if (is-none (get top-bidder auction))
    (get reserve auction)
    (let (
        (current (get top-amount auction))
        (bump (/ (* current (var-get min-increment-bps)) u10000))
        (min-inc (var-get min-increment-abs))
      )
      (+ current (if (> bump min-inc)
        bump
        min-inc
      ))
    )
  )
)

(define-private (pay-out
    (to principal)
    (amount uint)
  )
  (as-contract? ((with-stx amount))
    (try! (stx-transfer? amount current-contract to))
  )
)

(define-private (release-nft
    (nft <nft-trait>)
    (token-id uint)
    (to principal)
  )
  (as-contract? ((with-nft (contract-of nft) "*" (list token-id)))
    (try! (contract-call? nft transfer token-id current-contract to))
  )
)

(define-public (create-auction
    (nft <nft-trait>)
    (token-id uint)
    (reserve uint)
    (duration uint)
  )
  (let (
      (seller tx-sender)
      (nft-contract (contract-of nft))
      (auction-id (+ (var-get auction-nonce) u1))
      (ends-at (+ burn-block-height duration))
    )
    (asserts! (is-live) ERR-PAUSED)
    (asserts!
      (contract-call? .fakfun-market-registry is-collection-enabled nft-contract)
      ERR-COLLECTION-NOT-WHITELISTED
    )
    (asserts! (> reserve u0) ERR-INVALID-PRICE)
    (asserts! (and (>= duration MIN-DURATION) (<= duration MAX-DURATION))
      ERR-INVALID-DURATION
    )
    (try! (contract-call? nft transfer token-id seller current-contract))
    (map-set auctions auction-id {
      seller: seller,
      nft-contract: nft-contract,
      token-id: token-id,
      reserve: reserve,
      ends-at: ends-at,
      top-bidder: none,
      top-amount: u0,
      created-at: burn-block-height,
    })
    (var-set auction-nonce auction-id)
    (try! (log "auction-created" nft-contract token-id auction-id seller none reserve
      u0 u0 ends-at
    ))
    (ok auction-id)
  )
)

(define-public (bid
    (auction-id uint)
    (amount uint)
  )
  (let (
      (bidder tx-sender)
      (auction (unwrap! (map-get? auctions auction-id) ERR-AUCTION-NOT-FOUND))
      (prev-bidder (get top-bidder auction))
      (prev-amount (get top-amount auction))
      (ends-at (get ends-at auction))
    )
    (asserts! (is-live) ERR-PAUSED)
    (asserts!
      (contract-call? .fakfun-market-registry is-collection-enabled
        (get nft-contract auction)
      )
      ERR-COLLECTION-NOT-WHITELISTED
    )
    (asserts! (< burn-block-height ends-at) ERR-AUCTION-ENDED)
    (asserts! (not (is-eq bidder (get seller auction))) ERR-CANNOT-FILL-OWN)
    (asserts! (>= amount (min-next-bid auction)) ERR-BID-TOO-LOW)
    (let (
        (window-snipe (var-get snipe-window))
        (new-ends-at (if (< (- ends-at burn-block-height) window-snipe)
          (+ burn-block-height window-snipe)
          ends-at
        ))
      )
      (if (is-eq prev-bidder (some bidder))
        (try! (stx-transfer? (- amount prev-amount) bidder current-contract))
        (begin
          (try! (stx-transfer? amount bidder current-contract))
          (match prev-bidder
            p (try! (pay-out p prev-amount))
            true
          )
        )
      )
      (map-set auctions auction-id
        (merge auction {
          top-bidder: (some bidder),
          top-amount: amount,
          ends-at: new-ends-at,
        })
      )
      (try! (log "auction-bid" (get nft-contract auction) (get token-id auction)
        auction-id bidder prev-bidder amount u0 u0 new-ends-at
      ))
      (ok true)
    )
  )
)

(define-public (settle
    (auction-id uint)
    (nft <nft-trait>)
  )
  (let (
      (auction (unwrap! (map-get? auctions auction-id) ERR-AUCTION-NOT-FOUND))
      (seller (get seller auction))
      (token-id (get token-id auction))
      (nft-contract (contract-of nft))
      (price (get top-amount auction))
      (q (unwrap!
        (contract-call? .fakfun-market-registry quote (get nft-contract auction)
          price
        )
        ERR-COLLECTION-NOT-WHITELISTED
      ))
    )
    (asserts! (is-eq nft-contract (get nft-contract auction)) ERR-WRONG-NFT)
    (asserts! (>= burn-block-height (get ends-at auction)) ERR-AUCTION-LIVE)
    (map-delete auctions auction-id)
    (match (get top-bidder auction)
      winner (begin
        (try! (release-nft nft token-id winner))
        (try! (pay-out seller (get seller-receives q)))
        (if (> (get royalty q) u0)
          (try! (pay-out (get royalty-recipient q) (get royalty q)))
          true
        )
        (if (> (get platform-fee q) u0)
          (try! (pay-out (get platform-recipient q) (get platform-fee q)))
          true
        )
        (try! (log "auction-settled" nft-contract token-id auction-id seller
          (some winner) price (get royalty q) (get platform-fee q) u0
        ))
      )
      (begin
        (try! (release-nft nft token-id seller))
        (try! (log "auction-expired" nft-contract token-id auction-id seller none u0 u0
          u0 u0
        ))
      )
    )
    (ok true)
  )
)

(define-public (cancel-auction
    (auction-id uint)
    (nft <nft-trait>)
  )
  (let (
      (auction (unwrap! (map-get? auctions auction-id) ERR-AUCTION-NOT-FOUND))
      (seller (get seller auction))
      (token-id (get token-id auction))
    )
    (asserts! (is-eq tx-sender seller) ERR-NOT-SELLER)
    (asserts! (is-eq (contract-of nft) (get nft-contract auction)) ERR-WRONG-NFT)
    (asserts! (is-none (get top-bidder auction)) ERR-HAS-BIDS)
    (map-delete auctions auction-id)
    (try! (release-nft nft token-id seller))
    (try! (log "auction-cancelled" (contract-of nft) token-id auction-id seller none
      (get reserve auction) u0 u0 u0
    ))
    (ok true)
  )
)

(define-read-only (get-auction (auction-id uint))
  (map-get? auctions auction-id)
)

(define-read-only (get-last-auction-id)
  (var-get auction-nonce)
)

(define-read-only (get-min-increment)
  {
    bps: (var-get min-increment-bps),
    abs: (var-get min-increment-abs),
  }
)

(define-read-only (is-live)
  (and
    (not (contract-call? .fakfun-market-registry is-paused))
    (contract-call? .fakfun-market-registry is-market current-contract)
  )
)

(define-read-only (quote-auction (auction-id uint))
  (match (map-get? auctions auction-id)
    auction (match (contract-call? .fakfun-market-registry quote (get nft-contract auction)
      (get top-amount auction)
    )
      q (some (merge q {
        min-next-bid: (min-next-bid auction),
        ended: (>= burn-block-height (get ends-at auction)),
        blocks-left: (if (>= burn-block-height (get ends-at auction))
          u0
          (- (get ends-at auction) burn-block-height)
        ),
      }))
      none
    )
    none
  )
)
