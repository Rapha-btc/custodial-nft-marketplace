(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)


(define-constant MAX-ROYALTY-BPS u1000)
(define-constant MAX-PLATFORM-BPS u500)
(define-constant MAX-QUANTITY u100)
(define-constant ADMIN-COOLDOWN u144)

(define-constant ERR-NOT-AUTHORIZED (err u300))
(define-constant ERR-PAUSED (err u301))
(define-constant ERR-COLLECTION-NOT-WHITELISTED (err u302))
(define-constant ERR-INVALID-PRICE (err u304))
(define-constant ERR-INVALID-QUANTITY (err u305))
(define-constant ERR-BID-NOT-FOUND (err u306))
(define-constant ERR-NOT-BIDDER (err u307))
(define-constant ERR-WRONG-NFT (err u308))
(define-constant ERR-CANNOT-FILL-OWN (err u311))
(define-constant ERR-FEE-TOO-HIGH (err u313))
(define-constant ERR-INVALID-ADMIN (err u314))
(define-constant ERR-NO-PROPOSAL (err u315))
(define-constant ERR-COOLDOWN (err u316))

(define-data-var fakfun principal 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22)
(define-data-var pending-fakfun (optional {
  principal: principal,
  accept-after: uint,
}) none)
(define-data-var contract-paused bool false)
(define-data-var platform-fee-bps uint u250)
(define-data-var platform-recipient principal 'SMH8FRN30ERW1SX26NJTJCKTDR3H27NRJ6W75WQE)
(define-data-var bid-nonce uint u0)

(define-map collections
  principal
  {
    enabled: bool,
    royalty-bps: uint,
    royalty-recipient: principal,
  }
)


(define-map bids
  uint
  {
    bidder: principal,
    nft-contract: principal,
    price: uint,
    remaining: uint,
    created-at: uint,
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

(define-public (place-bid
    (nft-contract principal)
    (price uint)
    (quantity uint)
  )
  (let (
      (bidder tx-sender)
      (bid-id (+ (var-get bid-nonce) u1))
      (escrow (* price quantity))
    )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-collection-enabled nft-contract) ERR-COLLECTION-NOT-WHITELISTED)
    (asserts! (> price u0) ERR-INVALID-PRICE)
    (asserts! (and (> quantity u0) (<= quantity MAX-QUANTITY)) ERR-INVALID-QUANTITY)
    (try! (stx-transfer? escrow bidder current-contract))
    (map-set bids bid-id {
      bidder: bidder,
      nft-contract: nft-contract,
      price: price,
      remaining: quantity,
      created-at: stacks-block-height,
    })
    (var-set bid-nonce bid-id)
    (print {
      event: "bid-placed",
      bid-id: bid-id,
      bidder: bidder,
      nft-contract: nft-contract,
      price: price,
      quantity: quantity,
      escrow: escrow,
    })
    (ok bid-id)
  )
)

(define-public (cancel-bid (bid-id uint))
  (let (
      (bid (unwrap! (map-get? bids bid-id) ERR-BID-NOT-FOUND))
      (bidder (get bidder bid))
      (refund (* (get price bid) (get remaining bid)))
    )
    (asserts! (is-eq tx-sender bidder) ERR-NOT-BIDDER)
    (map-delete bids bid-id)
    (try! (as-contract? ((with-stx refund))
      (try! (stx-transfer? refund current-contract bidder))
    ))
    (print {
      event: "bid-cancelled",
      bid-id: bid-id,
      bidder: bidder,
      refund: refund,
    })
    (ok refund)
  )
)

(define-public (update-bid-price
    (bid-id uint)
    (new-price uint)
  )
  (let (
      (bid (unwrap! (map-get? bids bid-id) ERR-BID-NOT-FOUND))
      (bidder (get bidder bid))
      (remaining (get remaining bid))
      (old-escrow (* (get price bid) remaining))
      (new-escrow (* new-price remaining))
    )
    (asserts! (is-eq tx-sender bidder) ERR-NOT-BIDDER)
    (asserts! (> new-price u0) ERR-INVALID-PRICE)
    (asserts! (not (is-eq new-price (get price bid))) ERR-INVALID-PRICE)
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-collection-enabled (get nft-contract bid))
      ERR-COLLECTION-NOT-WHITELISTED
    )
    (map-set bids bid-id (merge bid { price: new-price }))
    (if (> new-escrow old-escrow)
      (try! (stx-transfer? (- new-escrow old-escrow) bidder current-contract))
      (try! (as-contract? ((with-stx (- old-escrow new-escrow)))
        (try! (stx-transfer? (- old-escrow new-escrow) current-contract bidder))
      ))
    )
    (print {
      event: "bid-updated",
      bid-id: bid-id,
      bidder: bidder,
      old-price: (get price bid),
      new-price: new-price,
      remaining: remaining,
      escrow: new-escrow,
    })
    (ok true)
  )
)

(define-public (accept-bid
    (bid-id uint)
    (token-id uint)
    (nft <nft-trait>)
  )
  (let (
      (seller tx-sender)
      (bid (unwrap! (map-get? bids bid-id) ERR-BID-NOT-FOUND))
      (bidder (get bidder bid))
      (nft-principal (contract-of nft))
      (collection (unwrap! (map-get? collections (get nft-contract bid))
        ERR-COLLECTION-NOT-WHITELISTED
      ))
      (price (get price bid))
      (remaining (get remaining bid))
      (royalty-amount (/ (* price (get royalty-bps collection)) u10000))
      (platform-amount (/ (* price (var-get platform-fee-bps)) u10000))
      (seller-amount (- price (+ royalty-amount platform-amount)))
    )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (get enabled collection) ERR-COLLECTION-NOT-WHITELISTED)
    (asserts! (is-eq nft-principal (get nft-contract bid)) ERR-WRONG-NFT)
    (asserts! (not (is-eq seller bidder)) ERR-CANNOT-FILL-OWN)
    (if (is-eq remaining u1)
      (map-delete bids bid-id)
      (map-set bids bid-id (merge bid { remaining: (- remaining u1) }))
    )
    (try! (contract-call? nft transfer token-id seller bidder))
    (try! (as-contract? ((with-stx price))
      (begin
        (try! (stx-transfer? seller-amount current-contract seller))
        (if (> royalty-amount u0)
          (try! (stx-transfer? royalty-amount current-contract
            (get royalty-recipient collection)
          ))
          true
        )
        (if (> platform-amount u0)
          (try! (stx-transfer? platform-amount current-contract
            (var-get platform-recipient)
          ))
          true
        )
        true
      )
    ))
    (print {
      event: "bid-filled",
      bid-id: bid-id,
      token-id: token-id,
      nft-contract: nft-principal,
      seller: seller,
      buyer: bidder,
      price: price,
      royalty-paid: royalty-amount,
      platform-fee-paid: platform-amount,
      remaining: (- remaining u1),
    })
    (ok true)
  )
)

(define-read-only (get-bid (bid-id uint))
  (map-get? bids bid-id)
)

(define-read-only (get-last-bid-id)
  (var-get bid-nonce)
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

(define-read-only (get-fakfun)
  (var-get fakfun)
)

(define-read-only (get-pending-fakfun)
  (var-get pending-fakfun)
)

(define-read-only (is-paused)
  (var-get contract-paused)
)

(define-read-only (quote-fill (bid-id uint))
  (match (map-get? bids bid-id)
    bid (match (map-get? collections (get nft-contract bid))
      collection (let (
          (price (get price bid))
          (royalty-amount (/ (* price (get royalty-bps collection)) u10000))
          (platform-amount (/ (* price (var-get platform-fee-bps)) u10000))
        )
        (some {
          price: price,
          seller-receives: (- price (+ royalty-amount platform-amount)),
          royalty: royalty-amount,
          platform-fee: platform-amount,
        })
      )
      none
    )
    none
  )
)
