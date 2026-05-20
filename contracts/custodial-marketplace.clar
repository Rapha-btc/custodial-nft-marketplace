(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant CONTRACT-OWNER tx-sender)

(define-constant ERR-NOT-AUTHORIZED (err u200))
(define-constant ERR-ALREADY-LISTED (err u201))
(define-constant ERR-NOT-LISTED (err u202))
(define-constant ERR-NOT-OWNER (err u203))
(define-constant ERR-FT-NOT-WHITELISTED (err u204))
(define-constant ERR-INVALID-PRICE (err u205))
(define-constant ERR-CANNOT-BUY-OWN (err u206))
(define-constant ERR-PAUSED (err u207))
(define-constant ERR-WRONG-NFT (err u208))
(define-constant ERR-ALREADY-INITIALIZED (err u209))
(define-constant ERR-NOT-INITIALIZED (err u210))
(define-constant ERR-WRONG-FT (err u211))

;; Auction error constants
(define-constant ERR-AUCTION-NOT-FOUND (err u220))
(define-constant ERR-AUCTION-ENDED (err u221))
(define-constant ERR-AUCTION-NOT-ENDED (err u222))
(define-constant ERR-BID-TOO-LOW (err u223))
(define-constant ERR-INVALID-DURATION (err u224))
(define-constant ERR-NO-BIDS (err u225))
(define-constant ERR-HAS-BIDS (err u226))
(define-constant ERR-ALREADY-AUCTIONED (err u227))
(define-constant ERR-CANNOT-BID-OWN (err u228))

;; Auction duration constants
(define-constant DURATION-24H u86400)
(define-constant DURATION-48H u172800)
(define-constant DURATION-72H u259200)

;; Anti-sniping constants
(define-constant ANTI-SNIPE-WINDOW u60)
(define-constant ANTI-SNIPE-EXTENSION u60)

;; Minimum bid increment in basis points (5% = 500/10000)
(define-constant MIN-BID-INCREMENT u500)

(define-data-var contract-paused bool false)
(define-data-var royalty-percent uint u250) 
(define-data-var royalty-recipient principal CONTRACT-OWNER)
(define-data-var platform-fee uint u250) 
(define-data-var platform-recipient principal CONTRACT-OWNER)

(define-data-var allowed-nft (optional principal) none)

(define-map whitelisted-fts principal bool)

(define-map listings uint {
  seller: principal,
  ft-contract: principal,
  price: uint,
  listed-at: uint
})

(define-map auctions uint {
  seller: principal,
  ft-contract: principal,
  start-price: uint,
  end-time: uint,
  highest-bid: uint,
  highest-bidder: (optional principal)
})

(define-public (initialize (nft-contract principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (is-none (var-get allowed-nft)) ERR-ALREADY-INITIALIZED)
    (var-set allowed-nft (some nft-contract))
    (print {event: "initialized", nft-contract: nft-contract})
    (ok true)))

(define-public (set-paused (paused bool))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set contract-paused paused)
    (print {event: "contract-paused", paused: paused})
    (ok true)))

(define-public (whitelist-ft (ft <ft-trait>) (whitelisted bool))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (map-set whitelisted-fts (contract-of ft) whitelisted)
    (print {event: "ft-whitelist-update", ft-contract: (contract-of ft), whitelisted: whitelisted})
    (ok true)))

(define-public (set-royalty-percent (percent uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= percent u1000) ERR-NOT-AUTHORIZED) ;; Max 10%
    (var-set royalty-percent percent)
    (print {event: "royalty-percent-updated", percent: percent})
    (ok true)))

(define-public (set-royalty-recipient (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set royalty-recipient recipient)
    (print {event: "royalty-recipient-updated", recipient: recipient})
    (ok true)))

(define-public (set-platform-fee (fee uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (<= fee u500) ERR-NOT-AUTHORIZED) ;; Max 5%
    (var-set platform-fee fee)
    (print {event: "platform-fee-updated", fee: fee})
    (ok true)))

(define-public (set-platform-recipient (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (var-set platform-recipient recipient)
    (print {event: "platform-recipient-updated", recipient: recipient})
    (ok true)))

(define-private (check-nft-allowed (nft-contract <nft-trait>))
  (match (var-get allowed-nft)
    allowed (is-eq (contract-of nft-contract) allowed)
    false))

(define-public (list-nft (token-id uint) (nft-contract <nft-trait>) (ft-contract <ft-trait>) (price uint))
  (let (
    (ft-principal (contract-of ft-contract))
    (seller tx-sender)
  )
    (asserts! (is-some (var-get allowed-nft)) ERR-NOT-INITIALIZED)
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (> price u0) ERR-INVALID-PRICE)
    (asserts! (is-ft-whitelisted ft-principal) ERR-FT-NOT-WHITELISTED)
    (asserts! (is-none (map-get? listings token-id)) ERR-ALREADY-LISTED)
    (asserts! (is-none (map-get? auctions token-id)) ERR-ALREADY-AUCTIONED)

    (try! (contract-call? nft-contract transfer token-id seller current-contract))

    (map-set listings token-id {
      seller: seller,
      ft-contract: ft-principal,
      price: price,
      listed-at: stacks-block-height
    })

    (print {
      event: "nft-listed",
      token-id: token-id,
      seller: seller,
      ft-contract: ft-principal,
      price: price
    })
    (ok true)))

(define-public (update-price (token-id uint) (new-price uint))
  (let (
    (listing (unwrap! (map-get? listings token-id) ERR-NOT-LISTED))
  )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq (get seller listing) tx-sender) ERR-NOT-OWNER)
    (asserts! (> new-price u0) ERR-INVALID-PRICE)

    (map-set listings token-id (merge listing {price: new-price}))

    (print {event: "price-updated", token-id: token-id, new-price: new-price})
    (ok true)))

(define-public (update-listing-ft (token-id uint) (new-ft-contract <ft-trait>) (new-price uint))
  (let (
    (listing (unwrap! (map-get? listings token-id) ERR-NOT-LISTED))
    (new-ft-principal (contract-of new-ft-contract))
  )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq (get seller listing) tx-sender) ERR-NOT-OWNER)
    (asserts! (> new-price u0) ERR-INVALID-PRICE)
    (asserts! (is-ft-whitelisted new-ft-principal) ERR-FT-NOT-WHITELISTED)

    (map-set listings token-id (merge listing {
      ft-contract: new-ft-principal,
      price: new-price
    }))

    (print {
      event: "listing-updated",
      token-id: token-id,
      ft-contract: new-ft-principal,
      price: new-price
    })
    (ok true)))

(define-public (unlist-nft (token-id uint) (nft-contract <nft-trait>))
  (let (
    (listing (unwrap! (map-get? listings token-id) ERR-NOT-LISTED))
    (seller (get seller listing))
  )
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)
    (asserts! (is-eq seller tx-sender) ERR-NOT-OWNER)

    (try! (as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
      (try! (contract-call? nft-contract transfer token-id current-contract seller))))

    (map-delete listings token-id)

    (print {event: "nft-unlisted", token-id: token-id, seller: seller})
    (ok true)))

(define-public (buy-nft (token-id uint) (nft-contract <nft-trait>) (ft-contract <ft-trait>))
  (let (
    (buyer tx-sender)
    (listing (unwrap! (map-get? listings token-id) ERR-NOT-LISTED))
    (seller (get seller listing))
    (price (get price listing))
    (listing-ft (get ft-contract listing))
    (royalty-amount (/ (* price (var-get royalty-percent)) u10000))
    (platform-amount (/ (* price (var-get platform-fee)) u10000))
    (seller-amount (- price (+ royalty-amount platform-amount)))
  )
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq (contract-of ft-contract) listing-ft) ERR-WRONG-FT)
    (asserts! (is-ft-whitelisted listing-ft) ERR-FT-NOT-WHITELISTED)
    (asserts! (not (is-eq buyer seller)) ERR-CANNOT-BUY-OWN)

    (try! (contract-call? ft-contract transfer seller-amount buyer seller none))

    (if (> royalty-amount u0)
      (try! (contract-call? ft-contract transfer royalty-amount buyer (var-get royalty-recipient) none))
      true
    )

    (if (> platform-amount u0)
      (try! (contract-call? ft-contract transfer platform-amount buyer (var-get platform-recipient) none))
      true
    )

    (try! (as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
      (try! (contract-call? nft-contract transfer token-id current-contract buyer))))

    (map-delete listings token-id)

    (print {
      event: "nft-sold",
      token-id: token-id,
      seller: seller,
      buyer: buyer,
      price: price,
      ft-contract: listing-ft,
      royalty-paid: royalty-amount,
      platform-fee-paid: platform-amount
    })
    (ok true)))

(define-public (admin-emergency-return (token-id uint) (nft-contract <nft-trait>))
  (let (
    (listing (unwrap! (map-get? listings token-id) ERR-NOT-LISTED))
    (seller (get seller listing))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)

    (try! (as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
      (try! (contract-call? nft-contract transfer token-id current-contract seller))))

    (map-delete listings token-id)

    (print {event: "admin-emergency-return", token-id: token-id, seller: seller})
    (ok true)))

;; ---- Auction Functions ----

(define-public (list-nft-auction (token-id uint) (nft-contract <nft-trait>) (ft-contract <ft-trait>) (start-price uint) (duration uint))
  (let (
    (ft-principal (contract-of ft-contract))
    (seller tx-sender)
    (end-time (+ stacks-block-time duration))
  )
    (asserts! (is-some (var-get allowed-nft)) ERR-NOT-INITIALIZED)
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (> start-price u0) ERR-INVALID-PRICE)
    (asserts! (is-ft-whitelisted ft-principal) ERR-FT-NOT-WHITELISTED)
    (asserts! (or (is-eq duration DURATION-24H) (is-eq duration DURATION-48H) (is-eq duration DURATION-72H)) ERR-INVALID-DURATION)
    (asserts! (is-none (map-get? listings token-id)) ERR-ALREADY-LISTED)
    (asserts! (is-none (map-get? auctions token-id)) ERR-ALREADY-AUCTIONED)

    (try! (contract-call? nft-contract transfer token-id seller current-contract))

    (map-set auctions token-id {
      seller: seller,
      ft-contract: ft-principal,
      start-price: start-price,
      end-time: end-time,
      highest-bid: u0,
      highest-bidder: none
    })

    (print {
      event: "auction-created",
      token-id: token-id,
      seller: seller,
      ft-contract: ft-principal,
      start-price: start-price,
      duration: duration,
      end-time: end-time
    })
    (ok true)))

(define-public (place-bid (token-id uint) (ft-contract <ft-trait>) (bid-amount uint))
  (let (
    (auction (unwrap! (map-get? auctions token-id) ERR-AUCTION-NOT-FOUND))
    (bidder tx-sender)
    (current-highest-bid (get highest-bid auction))
    (current-highest-bidder (get highest-bidder auction))
    (auction-end-time (get end-time auction))
    (ft-principal (contract-of ft-contract))
    (time-remaining (- auction-end-time stacks-block-time))
    (new-end-time (if (< time-remaining ANTI-SNIPE-WINDOW)
                    (+ auction-end-time ANTI-SNIPE-EXTENSION)
                    auction-end-time))
  )
    (asserts! (not (var-get contract-paused)) ERR-PAUSED)
    (asserts! (is-eq ft-principal (get ft-contract auction)) ERR-WRONG-FT)
    (asserts! (not (is-eq bidder (get seller auction))) ERR-CANNOT-BID-OWN)
    (asserts! (< stacks-block-time auction-end-time) ERR-AUCTION-ENDED)

    ;; Validate bid amount
    (if (is-eq current-highest-bid u0)
      (asserts! (>= bid-amount (get start-price auction)) ERR-BID-TOO-LOW)
      (asserts! (>= bid-amount (+ current-highest-bid (/ (* current-highest-bid MIN-BID-INCREMENT) u10000))) ERR-BID-TOO-LOW)
    )

    ;; Transfer bid from bidder to contract (escrow)
    (try! (contract-call? ft-contract transfer bid-amount bidder current-contract none))

    ;; Refund previous bidder if exists
    (match current-highest-bidder
      prev-bidder (try! (as-contract? ((with-ft ft-principal current-highest-bid))
                    (try! (contract-call? ft-contract transfer current-highest-bid current-contract prev-bidder none))))
      true
    )

    ;; Update auction with new bid and potentially extended end time
    (map-set auctions token-id (merge auction {
      highest-bid: bid-amount,
      highest-bidder: (some bidder),
      end-time: new-end-time
    }))

    (print {
      event: "bid-placed",
      token-id: token-id,
      bidder: bidder,
      bid-amount: bid-amount,
      previous-bid: current-highest-bid,
      new-end-time: new-end-time
    })
    (ok true)))

(define-public (settle-auction (token-id uint) (nft-contract <nft-trait>) (ft-contract <ft-trait>))
  (let (
    (auction (unwrap! (map-get? auctions token-id) ERR-AUCTION-NOT-FOUND))
    (seller (get seller auction))
    (final-price (get highest-bid auction))
    (winner (get highest-bidder auction))
    (ft-principal (get ft-contract auction))
  )
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)
    (asserts! (is-eq (contract-of ft-contract) ft-principal) ERR-WRONG-FT)
    (asserts! (>= stacks-block-time (get end-time auction)) ERR-AUCTION-NOT-ENDED)

    (match winner
      winning-bidder
        (let (
          (royalty-amount (/ (* final-price (var-get royalty-percent)) u10000))
          (platform-amount (/ (* final-price (var-get platform-fee)) u10000))
          (seller-amount (- final-price (+ royalty-amount platform-amount)))
        )
          ;; Transfer FT from contract to seller
          (try! (as-contract? ((with-ft ft-principal seller-amount))
            (try! (contract-call? ft-contract transfer seller-amount current-contract seller none))))

          ;; Transfer royalty
          (if (> royalty-amount u0)
            (try! (as-contract? ((with-ft ft-principal royalty-amount))
              (try! (contract-call? ft-contract transfer royalty-amount current-contract (var-get royalty-recipient) none))))
            true
          )

          ;; Transfer platform fee
          (if (> platform-amount u0)
            (try! (as-contract? ((with-ft ft-principal platform-amount))
              (try! (contract-call? ft-contract transfer platform-amount current-contract (var-get platform-recipient) none))))
            true
          )

          ;; Transfer NFT to winner
          (try! (as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
            (try! (contract-call? nft-contract transfer token-id current-contract winning-bidder))))

          (map-delete auctions token-id)

          (print {
            event: "auction-settled",
            token-id: token-id,
            seller: seller,
            winner: winning-bidder,
            final-price: final-price,
            royalty-paid: royalty-amount,
            platform-fee-paid: platform-amount
          })
          (ok true)
        )
      ;; No bids - return NFT to seller
      (begin
        (try! (as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
          (try! (contract-call? nft-contract transfer token-id current-contract seller))))

        (map-delete auctions token-id)

        (print {
          event: "auction-settled",
          token-id: token-id,
          seller: seller,
          winner: none,
          final-price: u0,
          royalty-paid: u0,
          platform-fee-paid: u0
        })
        (ok true)
      )
    )
  ))

(define-public (cancel-auction (token-id uint) (nft-contract <nft-trait>))
  (let (
    (auction (unwrap! (map-get? auctions token-id) ERR-AUCTION-NOT-FOUND))
    (seller (get seller auction))
  )
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)
    (asserts! (is-eq tx-sender seller) ERR-NOT-OWNER)
    (asserts! (is-none (get highest-bidder auction)) ERR-HAS-BIDS)

    (try! (as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
      (try! (contract-call? nft-contract transfer token-id current-contract seller))))

    (map-delete auctions token-id)

    (print {event: "auction-cancelled", token-id: token-id, seller: seller})
    (ok true)))

(define-public (admin-emergency-return-auction (token-id uint) (nft-contract <nft-trait>) (ft-contract <ft-trait>))
  (let (
    (auction (unwrap! (map-get? auctions token-id) ERR-AUCTION-NOT-FOUND))
    (seller (get seller auction))
    (ft-principal (get ft-contract auction))
    (highest-bid (get highest-bid auction))
    (highest-bidder (get highest-bidder auction))
  )
    (asserts! (is-eq tx-sender CONTRACT-OWNER) ERR-NOT-AUTHORIZED)
    (asserts! (check-nft-allowed nft-contract) ERR-WRONG-NFT)
    (asserts! (is-eq (contract-of ft-contract) ft-principal) ERR-WRONG-FT)

    ;; Return NFT to seller
    (try! (as-contract? ((with-nft (contract-of nft-contract) "*" (list token-id)))
      (try! (contract-call? nft-contract transfer token-id current-contract seller))))

    ;; Refund highest bidder if exists
    (match highest-bidder
      bidder (try! (as-contract? ((with-ft ft-principal highest-bid))
                (try! (contract-call? ft-contract transfer highest-bid current-contract bidder none))))
      true
    )

    (map-delete auctions token-id)

    (print {
      event: "auction-emergency-return",
      token-id: token-id,
      seller: seller,
      refunded-bidder: highest-bidder,
      refunded-amount: highest-bid
    })
    (ok true)))

;; ---- Read-Only Functions ----

(define-read-only (get-listing (token-id uint))
  (map-get? listings token-id))

(define-read-only (is-ft-whitelisted (ft-contract principal))
  (default-to false (map-get? whitelisted-fts ft-contract)))

(define-read-only (get-allowed-nft)
  (var-get allowed-nft))

(define-read-only (get-royalty-info)
  {
    percent: (var-get royalty-percent),
    recipient: (var-get royalty-recipient)
  })

(define-read-only (get-platform-info)
  {
    fee: (var-get platform-fee),
    recipient: (var-get platform-recipient)
  })

(define-read-only (is-paused)
  (var-get contract-paused))

(define-read-only (is-initialized)
  (is-some (var-get allowed-nft)))

(define-read-only (get-auction (token-id uint))
  (map-get? auctions token-id))

(define-read-only (get-auction-time-remaining (token-id uint))
  (match (map-get? auctions token-id)
    auction (if (> (get end-time auction) stacks-block-time)
              (ok (- (get end-time auction) stacks-block-time))
              (ok u0))
    ERR-AUCTION-NOT-FOUND))
