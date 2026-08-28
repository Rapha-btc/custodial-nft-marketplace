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

(define-constant ERR-BAD-ENTRY (err u317))

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
;; Seller-initiated STX auctions (eBay style). Seller escrows the NFT, sets a
;; reserve and a duration in burn blocks. Only the top bid stays escrowed.
;; Anti-snipe: a bid in the last SNIPE-WINDOW blocks extends the end.
;; After the end anyone can settle.
;; ---------------------------------------------------------------------------

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
(define-constant MIN-DURATION u36)
(define-constant MAX-DURATION u1008)
(define-constant SNIPE-WINDOW u6)

(define-constant ERR-BID-TOO-LOW (err u320))
(define-constant ERR-AUCTION-NOT-FOUND (err u322))
(define-constant ERR-AUCTION-ENDED (err u323))
(define-constant ERR-AUCTION-LIVE (err u324))
(define-constant ERR-INVALID-DURATION (err u325))
(define-constant ERR-HAS-BIDS (err u326))
(define-constant ERR-NOT-SELLER (err u327))

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
      )
      (+ current (if (> bump (var-get min-increment-abs)) bump (var-get min-increment-abs)))
    )
  )
)

(define-private (pay-out (to principal) (amount uint))
  (as-contract? ((with-stx amount))
    (try! (stx-transfer? amount current-contract to))
  )
)

(define-private (release-nft (nft <nft-trait>) (token-id uint) (to principal))
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
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-collection-enabled nft-contract) ERR-COLLECTION-NOT-WHITELISTED)
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
    (print {
      event: "auction-created",
      auction-id: auction-id,
      seller: seller,
      nft-contract: nft-contract,
      token-id: token-id,
      reserve: reserve,
      ends-at: ends-at,
    })
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
      (new-ends-at (if (< (- ends-at burn-block-height) SNIPE-WINDOW)
        (+ burn-block-height SNIPE-WINDOW)
        ends-at
      ))
    )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (< burn-block-height ends-at) ERR-AUCTION-ENDED)
    (asserts! (not (is-eq bidder (get seller auction))) ERR-CANNOT-FILL-OWN)
    (asserts! (>= amount (min-next-bid auction)) ERR-BID-TOO-LOW)
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
    (map-set auctions auction-id (merge auction {
      top-bidder: (some bidder),
      top-amount: amount,
      ends-at: new-ends-at,
    }))
    (print {
      event: "auction-bid",
      auction-id: auction-id,
      bidder: bidder,
      amount: amount,
      ends-at: new-ends-at,
      extended: (not (is-eq new-ends-at ends-at)),
    })
    (ok true)
  )
)

;; anyone can settle once the auction has ended
(define-public (settle
    (auction-id uint)
    (nft <nft-trait>)
  )
  (let (
      (auction (unwrap! (map-get? auctions auction-id) ERR-AUCTION-NOT-FOUND))
      (seller (get seller auction))
      (token-id (get token-id auction))
      (nft-contract (contract-of nft))
      (collection (unwrap! (map-get? collections nft-contract)
        ERR-COLLECTION-NOT-WHITELISTED
      ))
      (price (get top-amount auction))
      (royalty-amount (/ (* price (get royalty-bps collection)) u10000))
      (platform-amount (/ (* price (var-get platform-fee-bps)) u10000))
      (seller-amount (- price (+ royalty-amount platform-amount)))
    )
    (asserts! (is-eq nft-contract (get nft-contract auction)) ERR-WRONG-NFT)
    (asserts! (>= burn-block-height (get ends-at auction)) ERR-AUCTION-LIVE)
    (map-delete auctions auction-id)
    (match (get top-bidder auction)
      winner (begin
        (try! (release-nft nft token-id winner))
        (try! (pay-out seller seller-amount))
        (if (> royalty-amount u0)
          (try! (pay-out (get royalty-recipient collection) royalty-amount))
          true
        )
        (if (> platform-amount u0)
          (try! (pay-out (var-get platform-recipient) platform-amount))
          true
        )
        (print {
          event: "auction-settled",
          auction-id: auction-id,
          nft-contract: nft-contract,
          token-id: token-id,
          seller: seller,
          buyer: winner,
          price: price,
          royalty-paid: royalty-amount,
          platform-fee-paid: platform-amount,
        })
        true
      )
      (begin
        (try! (release-nft nft token-id seller))
        (print {
          event: "auction-expired",
          auction-id: auction-id,
          nft-contract: nft-contract,
          token-id: token-id,
          seller: seller,
        })
        true
      )
    )
    (ok true)
  )
)

;; seller can pull the NFT back only while there are no bids
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
    (print {
      event: "auction-cancelled",
      auction-id: auction-id,
      seller: seller,
      nft-contract: (contract-of nft),
      token-id: token-id,
    })
    (ok true)
  )
)

(define-read-only (get-auction (auction-id uint))
  (map-get? auctions auction-id)
)

(define-read-only (get-last-auction-id)
  (var-get auction-nonce)
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

(define-read-only (quote-auction (auction-id uint))
  (match (map-get? auctions auction-id)
    auction (match (map-get? collections (get nft-contract auction))
      collection (let (
          (price (get top-amount auction))
          (royalty-amount (/ (* price (get royalty-bps collection)) u10000))
          (platform-amount (/ (* price (var-get platform-fee-bps)) u10000))
        )
        (some {
          price: price,
          seller-receives: (- price (+ royalty-amount platform-amount)),
          royalty: royalty-amount,
          platform-fee: platform-amount,
          min-next-bid: (min-next-bid auction),
          ended: (>= burn-block-height (get ends-at auction)),
          blocks-left: (if (>= burn-block-height (get ends-at auction))
            u0
            (- (get ends-at auction) burn-block-height)
          ),
        })
      )
      none
    )
    none
  )
)
