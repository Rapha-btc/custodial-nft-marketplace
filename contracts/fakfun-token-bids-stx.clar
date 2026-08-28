(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant MAX-INCREMENT-BPS u1000)
(define-constant MAX-INCREMENT-ABS u100000000)

(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-PAUSED (err u301))
(define-constant ERR-COLLECTION-NOT-WHITELISTED (err u302))
(define-constant ERR-INVALID-PRICE (err u304))
(define-constant ERR-BID-NOT-FOUND (err u306))
(define-constant ERR-NOT-BIDDER (err u307))
(define-constant ERR-CANNOT-FILL-OWN (err u311))
(define-constant ERR-FEE-TOO-HIGH (err u313))
(define-constant ERR-BID-TOO-LOW (err u320))

(define-data-var min-increment-bps uint u200)
(define-data-var min-increment-abs uint u1000000)

(define-map token-bids
  {
    nft-contract: principal,
    token-id: uint,
  }
  {
    top-bidder: principal,
    top-amount: uint,
    second: (optional {
      bidder: principal,
      amount: uint,
    }),
    updated-at: uint,
  }
)

(define-private (is-admin)
  (is-eq tx-sender (contract-call? .fakfun-market-registry get-fakfun))
)

(define-private (log
    (event (string-ascii 24))
    (nft-contract principal)
    (token-id uint)
    (actor principal)
    (counterparty (optional principal))
    (price uint)
    (royalty uint)
    (platform-fee uint)
    (ref uint)
  )
  (contract-call? .fakfun-market-registry log event nft-contract token-id u0
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

(define-read-only (min-next-bid (current uint))
  (let (
      (bump (/ (* current (var-get min-increment-bps)) u10000))
      (min-inc (var-get min-increment-abs))
    )
    (+ current (if (> bump min-inc)
      bump
      min-inc
    ))
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

(define-private (refund-second (second (optional {
  bidder: principal,
  amount: uint,
})))
  (match second
    s (pay-out (get bidder s) (get amount s))
    (ok true)
  )
)

(define-public (place-bid
    (nft-contract principal)
    (token-id uint)
    (amount uint)
  )
  (let (
      (bidder tx-sender)
      (key {
        nft-contract: nft-contract,
        token-id: token-id,
      })
    )
    (asserts! (is-live) ERR-PAUSED)
    (asserts!
      (contract-call? .fakfun-market-registry is-collection-enabled nft-contract)
      ERR-COLLECTION-NOT-WHITELISTED
    )
    (asserts! (> amount u0) ERR-INVALID-PRICE)
    (match (map-get? token-bids key)
      existing (let (
          (top-bidder (get top-bidder existing))
          (top-amount (get top-amount existing))
          (second (get second existing))
        )
        (asserts! (>= amount (min-next-bid top-amount)) ERR-BID-TOO-LOW)
        (if (is-eq bidder top-bidder)
          (begin
            (try! (stx-transfer? (- amount top-amount) bidder current-contract))
            (map-set token-bids key
              (merge existing {
                top-amount: amount,
                updated-at: burn-block-height,
              })
            )
            (try! (log "token-bid-raised" nft-contract token-id bidder
              (get bidder second) amount u0 u0
              (default-to u0 (get amount second))
            ))
          )
          (begin
            (try! (stx-transfer? amount bidder current-contract))
            (try! (refund-second second))
            (map-set token-bids key {
              top-bidder: bidder,
              top-amount: amount,
              second: (some {
                bidder: top-bidder,
                amount: top-amount,
              }),
              updated-at: burn-block-height,
            })
            (try! (log "token-bid-placed" nft-contract token-id bidder
              (some top-bidder) amount u0 u0 top-amount
            ))
          )
        )
      )
      (begin
        (try! (stx-transfer? amount bidder current-contract))
        (map-set token-bids key {
          top-bidder: bidder,
          top-amount: amount,
          second: none,
          updated-at: burn-block-height,
        })
        (try! (log "token-bid-placed" nft-contract token-id bidder none amount u0 u0 u0))
      )
    )
    (ok true)
  )
)

(define-public (cancel-bid
    (nft-contract principal)
    (token-id uint)
  )
  (let (
      (key {
        nft-contract: nft-contract,
        token-id: token-id,
      })
      (existing (unwrap! (map-get? token-bids key) ERR-BID-NOT-FOUND))
      (second (get second existing))
    )
    (if (is-eq tx-sender (get top-bidder existing))
      (begin
        (try! (pay-out tx-sender (get top-amount existing)))
        (match second
          s (map-set token-bids key {
            top-bidder: (get bidder s),
            top-amount: (get amount s),
            second: none,
            updated-at: burn-block-height,
          })
          (map-delete token-bids key)
        )
        (try! (log "token-bid-cancelled" nft-contract token-id tx-sender
          (get bidder second) (get top-amount existing) u0 u0
          (default-to u0 (get amount second))
        ))
      )
      (let ((s (unwrap! second ERR-NOT-BIDDER)))
        (asserts! (is-eq tx-sender (get bidder s)) ERR-NOT-BIDDER)
        (try! (pay-out tx-sender (get amount s)))
        (map-set token-bids key
          (merge existing {
            second: none,
            updated-at: burn-block-height,
          })
        )
        (try! (log "token-bid-cancelled" nft-contract token-id tx-sender
          (some (get top-bidder existing)) (get amount s) u0 u0
          (get top-amount existing)
        ))
      )
    )
    (ok true)
  )
)

(define-public (accept-bid
    (token-id uint)
    (nft <nft-trait>)
  )
  (let (
      (seller tx-sender)
      (nft-contract (contract-of nft))
      (key {
        nft-contract: nft-contract,
        token-id: token-id,
      })
      (existing (unwrap! (map-get? token-bids key) ERR-BID-NOT-FOUND))
      (bidder (get top-bidder existing))
      (price (get top-amount existing))
      (q (unwrap! (contract-call? .fakfun-market-registry quote nft-contract price)
        ERR-COLLECTION-NOT-WHITELISTED
      ))
    )
    (asserts! (is-live) ERR-PAUSED)
    (asserts!
      (contract-call? .fakfun-market-registry is-collection-enabled nft-contract)
      ERR-COLLECTION-NOT-WHITELISTED
    )
    (asserts! (not (is-eq seller bidder)) ERR-CANNOT-FILL-OWN)
    (map-delete token-bids key)
    (try! (contract-call? nft transfer token-id seller bidder))
    (try! (pay-out seller (get seller-receives q)))
    (if (> (get royalty q) u0)
      (try! (pay-out (get royalty-recipient q) (get royalty q)))
      true
    )
    (if (> (get platform-fee q) u0)
      (try! (pay-out (get platform-recipient q) (get platform-fee q)))
      true
    )
    (try! (refund-second (get second existing)))
    (try! (log "token-bid-filled" nft-contract token-id seller (some bidder) price
      (get royalty q) (get platform-fee q) u0
    ))
    (ok true)
  )
)

(define-read-only (get-token-bid
    (nft-contract principal)
    (token-id uint)
  )
  (map-get? token-bids {
    nft-contract: nft-contract,
    token-id: token-id,
  })
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

(define-read-only (quote-fill
    (nft-contract principal)
    (token-id uint)
  )
  (match (map-get? token-bids {
    nft-contract: nft-contract,
    token-id: token-id,
  })
    bid (match (contract-call? .fakfun-market-registry quote nft-contract
      (get top-amount bid)
    )
      q (some (merge q { min-next-bid: (min-next-bid (get top-amount bid)) }))
      none
    )
    none
  )
)
