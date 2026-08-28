(define-constant MAX-ROYALTY-BPS u1000)
(define-constant MAX-PLATFORM-BPS u500)
(define-constant ADMIN-COOLDOWN u144)

(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-FEE-TOO-HIGH (err u313))
(define-constant ERR-INVALID-ADMIN (err u314))
(define-constant ERR-NO-PROPOSAL (err u315))
(define-constant ERR-COOLDOWN (err u316))
(define-constant ERR-BAD-ENTRY (err u317))
(define-constant ERR-NOT-MARKET (err u318))

(define-data-var fakfun principal 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22)
(define-data-var pending-fakfun (optional {
  principal: principal,
  accept-after: uint,
}) none)
(define-data-var registry-paused bool false)
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

(define-map markets
  principal
  bool
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
    (var-set fakfun tx-sender)
    (var-set pending-fakfun none)
    (print {
      event: "fakfun-updated",
      fakfun: tx-sender,
    })
    (ok true)
  )
)

(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (var-set registry-paused paused)
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

(define-public (set-market
    (market principal)
    (enabled bool)
  )
  (begin
    (asserts! (is-admin) ERR-NOT-AUTHORIZED)
    (map-set markets market enabled)
    (print {
      event: "market-updated",
      market: market,
      enabled: enabled,
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

(define-public (log
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
  (begin
    (asserts! (is-known-market contract-caller) ERR-NOT-MARKET)
    (print {
      event: event,
      market: contract-caller,
      nft-contract: nft-contract,
      token-id: token-id,
      id: id,
      actor: actor,
      counterparty: counterparty,
      price: price,
      royalty: royalty,
      platform-fee: platform-fee,
      ref: ref,
      burn-height: burn-block-height,
    })
    (ok true)
  )
)

(define-read-only (is-market (market principal))
  (default-to false (map-get? markets market))
)

(define-read-only (is-known-market (market principal))
  (is-some (map-get? markets market))
)

(define-read-only (get-collection (nft-contract principal))
  (map-get? collections nft-contract)
)

(define-read-only (is-collection-enabled (nft-contract principal))
  (default-to false (get enabled (map-get? collections nft-contract)))
)

(define-read-only (get-platform-fee-bps)
  (var-get platform-fee-bps)
)

(define-read-only (get-platform-recipient)
  (var-get platform-recipient)
)

(define-read-only (get-fakfun)
  (var-get fakfun)
)

(define-read-only (get-pending-fakfun)
  (var-get pending-fakfun)
)

(define-read-only (is-paused)
  (var-get registry-paused)
)

(define-read-only (quote
    (nft-contract principal)
    (price uint)
  )
  (match (map-get? collections nft-contract)
    collection (let (
        (royalty-amount (/ (* price (get royalty-bps collection)) u10000))
        (platform-amount (/ (* price (var-get platform-fee-bps)) u10000))
      )
      (some {
        price: price,
        seller-receives: (- price (+ royalty-amount platform-amount)),
        royalty: royalty-amount,
        royalty-recipient: (get royalty-recipient collection),
        platform-fee: platform-amount,
        platform-recipient: (var-get platform-recipient),
      })
    )
    none
  )
)
