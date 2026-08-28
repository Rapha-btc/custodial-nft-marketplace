(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant MAX-ROYALTY-BPS u1000)
(define-constant MAX-PLATFORM-BPS u500)
(define-constant ADMIN-COOLDOWN u144)

(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-PAUSED (err u301))
(define-constant ERR-COLLECTION-NOT-WHITELISTED (err u302))
(define-constant ERR-INVALID-PRICE (err u304))
(define-constant ERR-BID-NOT-FOUND (err u306))
(define-constant ERR-NOT-BIDDER (err u307))
(define-constant ERR-CANNOT-FILL-OWN (err u311))
(define-constant ERR-FEE-TOO-HIGH (err u313))
(define-constant ERR-INVALID-ADMIN (err u314))
(define-constant ERR-NO-PROPOSAL (err u315))
(define-constant ERR-COOLDOWN (err u316))
(define-constant ERR-BAD-ENTRY (err u317))
(define-constant ERR-BID-TOO-LOW (err u320))

(define-constant MAX-INCREMENT-BPS u1000)
(define-constant MAX-INCREMENT-ABS u100000000)

(define-data-var min-increment-bps uint u200)
(define-data-var min-increment-abs uint u1000000)

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

(define-read-only (get-min-increment)
  {
    bps: (var-get min-increment-bps),
    abs: (var-get min-increment-abs),
  }
)



(define-data-var fakfun principal 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22)
(define-data-var pending-fakfun (optional {
  principal: principal,
  accept-after: uint,
}) none)
(define-data-var contract-paused bool false)
(define-data-var platform-fee-bps uint u250)
(define-data-var platform-recipient principal 'SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE)

(define-map collections
  principal
  {
    enabled: bool,
    royalty-bps: uint,
    royalty-recipient: principal,
  }
)

(define-private (is-admin)
  (is-eq tx-sender (var-get fakfun))
)

(define-public (propose-fakfun (new-fakfun principal))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (asserts! (not (is-eq new-fakfun (var-get fakfun))) ERR-INVALID-ADMIN)
    (var-set pending-fakfun
      (some {
        principal: new-fakfun,
        accept-after: (+ burn-block-height ADMIN-COOLDOWN),
      })
    )
    (print {
      event: "fakfun-proposed",
      proposed: new-fakfun,
      accept-after: (+ burn-block-height ADMIN-COOLDOWN),
    })
    (ok true)
  )
)

(define-public (cancel-fakfun-proposal)
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (asserts! (is-some (var-get pending-fakfun)) ERR-NO-PROPOSAL)
    (var-set pending-fakfun none)
    (print { event: "fakfun-proposal-cancelled" })
    (ok true)
  )
)

(define-public (accept-fakfun)
  (let ((pending (unwrap! (var-get pending-fakfun) ERR-NO-PROPOSAL)))
    (asserts! (is-eq tx-sender (get principal pending)) ERR-NOT-AUTHORIZED)
    (asserts! (>= burn-block-height (get accept-after pending)) ERR-COOLDOWN)
    (var-set fakfun (get principal pending))
    (var-set pending-fakfun none)
    (print {
      event: "fakfun-updated",
      fakfun: (get principal pending),
    })
    (ok true)
  )
)

(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (var-set contract-paused paused)
    (print {
      event: "paused-updated",
      paused: paused,
    })
    (ok true)
  )
)

(define-public (set-platform-fee (bps uint))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (asserts! (<= bps MAX-PLATFORM-BPS) ERR-FEE-TOO-HIGH)
    (var-set platform-fee-bps bps)
    (print {
      event: "platform-fee-updated",
      bps: bps,
    })
    (ok true)
  )
)

(define-public (set-platform-recipient (recipient principal))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (var-set platform-recipient recipient)
    (print {
      event: "platform-recipient-updated",
      recipient: recipient,
    })
    (ok true)
  )
)

(define-public (set-collection
    (nft-contract principal)
    (enabled bool)
    (royalty-bps uint)
    (royalty-recipient principal)
  )
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (asserts! (<= royalty-bps MAX-ROYALTY-BPS) ERR-FEE-TOO-HIGH)
    (map-set collections nft-contract {
      enabled: enabled,
      royalty-bps: royalty-bps,
      royalty-recipient: royalty-recipient,
    })
    (print {
      event: "collection-updated",
      nft-contract: nft-contract,
      enabled: enabled,
      royalty-bps: royalty-bps,
      royalty-recipient: royalty-recipient,
    })
    (ok true)
  )
)

(define-private (set-collection-entry
    (entry {
      nft-contract: principal,
      royalty-bps: uint,
      royalty-recipient: principal,
    })
    (acc (response uint uint))
  )
  (let ((n (try! acc)))
    (asserts! (<= (get royalty-bps entry) MAX-ROYALTY-BPS) ERR-FEE-TOO-HIGH)
    (map-set collections (get nft-contract entry) {
      enabled: true,
      royalty-bps: (get royalty-bps entry),
      royalty-recipient: (get royalty-recipient entry),
    })
    (print {
      event: "collection-updated",
      nft-contract: (get nft-contract entry),
      enabled: true,
      royalty-bps: (get royalty-bps entry),
      royalty-recipient: (get royalty-recipient entry),
    })
    (ok (+ n u1))
  )
)

(define-public (set-collections (entries (list 50
  {
    nft-contract: principal,
    royalty-bps: uint,
    royalty-recipient: principal,
  }
)))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (asserts! (> (len entries) u0) ERR-BAD-ENTRY)
    (fold set-collection-entry entries (ok u0))
  )
)

;; ---------------------------------------------------------------------------
;; Token bids: standing STX bids on a specific token id. No deadline.
;; Only the top 2 bids (from 2 different wallets) stay escrowed; everyone
;; else is refunded at outbid time. Owner accepts the top bid whenever.
;; ---------------------------------------------------------------------------

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

(define-read-only (min-next-bid (current uint))
  (let ((bump (/ (* current (var-get min-increment-bps)) u10000)))
    (+ current (if (> bump (var-get min-increment-abs)) bump (var-get min-increment-abs)))
  )
)

(define-private (pay-out (to principal) (amount uint))
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
      (key { nft-contract: nft-contract, token-id: token-id })
    )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-collection-enabled nft-contract) ERR-COLLECTION-NOT-WHITELISTED)
    (asserts! (> amount u0) ERR-INVALID-PRICE)
    (match (map-get? token-bids key)
      existing (let (
          (top-bidder (get top-bidder existing))
          (top-amount (get top-amount existing))
          (second (get second existing))
        )
        (asserts! (>= amount (min-next-bid top-amount)) ERR-BID-TOO-LOW)
        (if (is-eq bidder top-bidder)
          ;; top bidder raises their own bid: pay the difference, second untouched
          (begin
            (try! (stx-transfer? (- amount top-amount) bidder current-contract))
            (map-set token-bids key (merge existing {
              top-amount: amount,
              updated-at: burn-block-height,
            }))
          )
          (begin
            (try! (stx-transfer? amount bidder current-contract))
            ;; old second is refunded (this is also the bidder's own old second, if any)
            (try! (refund-second second))
            (map-set token-bids key {
              top-bidder: bidder,
              top-amount: amount,
              second: (some { bidder: top-bidder, amount: top-amount }),
              updated-at: burn-block-height,
            })
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
      )
    )
    (print {
      event: "token-bid-placed",
      nft-contract: nft-contract,
      token-id: token-id,
      bidder: bidder,
      amount: amount,
      bid: (map-get? token-bids key),
    })
    (ok true)
  )
)

(define-public (cancel-bid
    (nft-contract principal)
    (token-id uint)
  )
  (let (
      (key { nft-contract: nft-contract, token-id: token-id })
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
      )
      (let ((s (unwrap! second ERR-NOT-BIDDER)))
        (asserts! (is-eq tx-sender (get bidder s)) ERR-NOT-BIDDER)
        (try! (pay-out tx-sender (get amount s)))
        (map-set token-bids key (merge existing {
          second: none,
          updated-at: burn-block-height,
        }))
      )
    )
    (print {
      event: "token-bid-cancelled",
      nft-contract: nft-contract,
      token-id: token-id,
      bidder: tx-sender,
      bid: (map-get? token-bids key),
    })
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
      (key { nft-contract: nft-contract, token-id: token-id })
      (existing (unwrap! (map-get? token-bids key) ERR-BID-NOT-FOUND))
      (collection (unwrap! (map-get? collections nft-contract)
        ERR-COLLECTION-NOT-WHITELISTED
      ))
      (bidder (get top-bidder existing))
      (price (get top-amount existing))
      (royalty-amount (/ (* price (get royalty-bps collection)) u10000))
      (platform-amount (/ (* price (var-get platform-fee-bps)) u10000))
      (seller-amount (- price (+ royalty-amount platform-amount)))
    )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (get enabled collection) ERR-COLLECTION-NOT-WHITELISTED)
    (asserts! (not (is-eq seller bidder)) ERR-CANNOT-FILL-OWN)
    (map-delete token-bids key)
    (try! (contract-call? nft transfer token-id seller bidder))
    (try! (pay-out seller seller-amount))
    (if (> royalty-amount u0)
      (try! (pay-out (get royalty-recipient collection) royalty-amount))
      true
    )
    (if (> platform-amount u0)
      (try! (pay-out (var-get platform-recipient) platform-amount))
      true
    )
    (try! (refund-second (get second existing)))
    (print {
      event: "token-bid-filled",
      nft-contract: nft-contract,
      token-id: token-id,
      seller: seller,
      buyer: bidder,
      price: price,
      royalty-paid: royalty-amount,
      platform-fee-paid: platform-amount,
    })
    (ok true)
  )
)

(define-read-only (get-token-bid (nft-contract principal) (token-id uint))
  (map-get? token-bids { nft-contract: nft-contract, token-id: token-id })
)

(define-read-only (get-collection (nft-contract principal))
  (map-get? collections nft-contract)
)

(define-read-only (is-collection-enabled (nft-contract principal))
  (default-to false (get enabled (map-get? collections nft-contract)))
)

(define-read-only (get-platform-fee-bps) (var-get platform-fee-bps))
(define-read-only (get-fakfun) (var-get fakfun))
(define-read-only (get-pending-fakfun) (var-get pending-fakfun))
(define-read-only (is-paused) (var-get contract-paused))

(define-read-only (quote-fill (nft-contract principal) (token-id uint))
  (match (map-get? token-bids { nft-contract: nft-contract, token-id: token-id })
    bid (match (map-get? collections nft-contract)
      collection (let (
          (price (get top-amount bid))
          (royalty-amount (/ (* price (get royalty-bps collection)) u10000))
          (platform-amount (/ (* price (var-get platform-fee-bps)) u10000))
        )
        (some {
          price: price,
          seller-receives: (- price (+ royalty-amount platform-amount)),
          royalty: royalty-amount,
          platform-fee: platform-amount,
          min-next-bid: (min-next-bid price),
        })
      )
      none
    )
    none
  )
)
