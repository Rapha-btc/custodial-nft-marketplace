;; Rendezvous fuzzing harness for fakfun-collection-bids.
;;
;; Deploy-time setup (bottom of the file): the simnet deployer becomes the
;; `fakfun` admin, the rv-nft mock collection is whitelisted at 2.5% royalty,
;; 10 NFTs and 1e9 rv-sats (mock SIP-010, same trait contract as the bids
;; contract imports) are minted to each of four wallets (ids 1..40).
;;
;; The fuzzer drives every public function with random senders and arguments,
;; including admin calls from the deployer (pause, disable, de-list, propose),
;; so the invariants below must hold under any interleaving of those.

(define-constant RV_NFT .rv-nft)
(define-constant RV_SBTC .rv-ft) ;; mock SIP-010 standing in for sBTC (same trait contract)

;; rv 1.x bookkeeping hook
(define-map context (string-ascii 100) { called: uint })
(define-private (update-context (function-name (string-ascii 100)) (called uint))
  (ok (map-set context function-name { called: called })))
(define-constant RV_IDS (list
  u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15 u16 u17 u18 u19 u20
  u21 u22 u23 u24 u25 u26 u27 u28 u29 u30 u31 u32 u33 u34 u35 u36 u37 u38 u39 u40
  u41 u42 u43 u44 u45 u46 u47 u48 u49 u50 u51 u52 u53 u54 u55 u56 u57 u58 u59 u60
  u61 u62 u63 u64 u65 u66 u67 u68 u69 u70 u71 u72 u73 u74 u75 u76 u77 u78 u79 u80))

(define-private (rv-escrow-of (id uint) (acc uint))
  (match (map-get? bids id)
    bid (+ acc (* (get price bid) (get remaining bid)))
    acc))

(define-read-only (rv-total-escrow)
  (fold rv-escrow-of RV_IDS u0))

(define-read-only (rv-sbtc-of (who principal))
  (unwrap-panic (contract-call? .rv-ft get-balance who)))

;; ---- invariants ------------------------------------------------------------

;; Every sat the contract holds is spoken for by an open bid, and every open
;; bid is fully backed: contract sBTC == sum(price x remaining). No path can
;; strand or over-promise escrow. (Bids are only ever paid in sBTC here.)
(define-read-only (invariant-escrow-exactly-backs-bids)
  (and
    (<= (var-get bid-nonce) u80)
    (is-eq (rv-sbtc-of current-contract) (rv-total-escrow))))

(define-private (rv-bid-well-formed (id uint) (ok-so-far bool))
  (and ok-so-far
    (match (map-get? bids id)
      bid (and (> (get remaining bid) u0) (> (get price bid) u0) (<= id (var-get bid-nonce)))
      true)))

;; A stored bid always has price > 0 and remaining > 0 (filled-out bids are
;; deleted, never left at zero), and no id above the nonce exists.
(define-read-only (invariant-bids-well-formed)
  (fold rv-bid-well-formed RV_IDS true))

;; Fee caps can never be exceeded through the setters.
(define-read-only (invariant-fee-caps)
  (and
    (<= (var-get platform-fee-bps) MAX-PLATFORM-BPS)
    (match (map-get? collections RV_NFT)
      c (<= (get royalty-bps c) MAX-ROYALTY-BPS)
      true)))

;; A pending handover never names the current admin, and its accept height is
;; always in the future relative to when it was proposed.
(define-read-only (invariant-pending-admin-differs)
  (match (var-get pending-fakfun)
    p (not (is-eq (get principal p) (var-get fakfun)))
    true))

;; ---- property tests --------------------------------------------------------

;; Invariant mode rarely lands on the whitelisted (collection, ft) pair with
;; random principals, so every property test re-asserts the escrow invariants
;; after its own action: invariants under fuzzed bid sequences.
(define-private (rv-invariants-hold)
  (begin
    (asserts! (invariant-escrow-exactly-backs-bids) (err u990))
    (asserts! (invariant-bids-well-formed) (err u991))
    (asserts! (invariant-fee-caps) (err u992))
    (asserts! (invariant-pending-admin-differs) (err u993))
    (ok true)))

(define-private (rv-price (p uint)) (+ u1 (mod p u20000)))
(define-private (rv-qty (q uint)) (+ u1 (mod q u5)))
(define-private (rv-id (i uint)) (+ u1 (mod i u40)))
(define-private (rv-bid-id (i uint)) (+ u1 (mod i (+ u1 (var-get bid-nonce)))))

;; place-bid escrows exactly price x quantity and stores the bid verbatim
(define-private (test-place-bid-escrows (p uint) (q uint))
  (let (
      (price (rv-price p))
      (qty (rv-qty q))
      (before (rv-sbtc-of current-contract))
      (bid-id (try! (place-bid RV_NFT RV_SBTC price qty)))
      (bid (unwrap-panic (map-get? bids bid-id)))
    )
    (asserts! (is-eq (- (rv-sbtc-of current-contract) before) (* price qty)) (err u900))
    (asserts! (is-eq (get bidder bid) tx-sender) (err u901))
    (asserts! (is-eq (get price bid) price) (err u902))
    (asserts! (is-eq (get remaining bid) qty) (err u903))
    (asserts! (is-eq bid-id (var-get bid-nonce)) (err u904))
    (rv-invariants-hold)))

(define-read-only (can-test-place-bid-escrows (p uint) (q uint))
  (and
    (not (var-get contract-paused))
    (is-collection-enabled RV_NFT)
    (is-ft-whitelisted RV_SBTC)
    (< (var-get bid-nonce) u80)
    (>= (rv-sbtc-of tx-sender) (* (rv-price p) (rv-qty q)))))

;; cancel-bid refunds exactly price x remaining and deletes the bid
(define-private (test-cancel-refunds (i uint))
  (let (
      (bid-id (rv-bid-id i))
      (bid (unwrap-panic (map-get? bids bid-id)))
      (owed (* (get price bid) (get remaining bid)))
      (before (rv-sbtc-of tx-sender))
      (refund (try! (cancel-bid bid-id RV_SBTC)))
    )
    (asserts! (is-eq refund owed) (err u910))
    (asserts! (is-eq (- (rv-sbtc-of tx-sender) before) owed) (err u911))
    (asserts! (is-none (map-get? bids bid-id)) (err u912))
    (rv-invariants-hold)))

(define-read-only (can-test-cancel-refunds (i uint))
  (match (map-get? bids (rv-bid-id i))
    bid (is-eq (get bidder bid) tx-sender)
    false))

;; accept-bid moves the NFT to the bidder, pays seller price - fees out of
;; escrow, and decrements remaining (deleting at zero)
(define-private (test-accept-bid-pays (i uint) (t uint))
  (let (
      (bid-id (rv-bid-id i))
      (token-id (rv-id t))
      (bid (unwrap-panic (map-get? bids bid-id)))
      (coll (unwrap-panic (map-get? collections RV_NFT)))
      (price (get price bid))
      (royalty (/ (* price (get royalty-bps coll)) u10000))
      (platform (/ (* price (var-get platform-fee-bps)) u10000))
      (net (- price (+ royalty platform)))
      (seller-before (rv-sbtc-of tx-sender))
      (escrow-before (rv-sbtc-of current-contract))
      (remaining (get remaining bid))
      (res (try! (accept-bid bid-id token-id RV_NFT RV_SBTC)))
    )
    (asserts! (is-eq (unwrap-panic (contract-call? .rv-nft get-owner token-id)) (some (get bidder bid))) (err u920))
    (asserts! (is-eq (- (rv-sbtc-of tx-sender) seller-before) net) (err u921))
    (asserts! (is-eq (- escrow-before (rv-sbtc-of current-contract)) price) (err u922))
    (asserts!
      (if (is-eq remaining u1)
        (is-none (map-get? bids bid-id))
        (is-eq (get remaining (unwrap-panic (map-get? bids bid-id))) (- remaining u1)))
      (err u923))
    (rv-invariants-hold)))

(define-read-only (can-test-accept-bid-pays (i uint) (t uint))
  (let (
      (bid-id (rv-bid-id i))
      (token-id (rv-id t))
    )
    (and
      (not (var-get contract-paused))
      (is-collection-enabled RV_NFT)
      (match (map-get? bids bid-id)
        bid (and
          (not (is-eq (get bidder bid) tx-sender))
          ;; the seller must not be a fee recipient or the deltas double up
          (not (is-eq tx-sender (var-get platform-recipient)))
          (not (is-eq tx-sender (get royalty-recipient (unwrap-panic (map-get? collections RV_NFT)))))
          (is-eq (unwrap-panic (contract-call? .rv-nft get-owner token-id)) (some tx-sender)))
        false))))

;; update-bid-price keeps escrow == new price x remaining, moving exactly the
;; difference to or from the bidder
(define-private (test-update-price-rebalances (i uint) (p uint))
  (let (
      (bid-id (rv-bid-id i))
      (bid (unwrap-panic (map-get? bids bid-id)))
      (new-price (rv-price p))
      (remaining (get remaining bid))
      (old-escrow (* (get price bid) remaining))
      (new-escrow (* new-price remaining))
      (bidder-before (rv-sbtc-of tx-sender))
      (contract-before (rv-sbtc-of current-contract))
      (res (try! (update-bid-price bid-id RV_SBTC new-price)))
    )
    (asserts! (is-eq (get price (unwrap-panic (map-get? bids bid-id))) new-price) (err u930))
    (asserts! (is-eq (- (rv-sbtc-of current-contract) contract-before) (- new-escrow old-escrow)) (err u931))
    (asserts! (is-eq (- bidder-before (rv-sbtc-of tx-sender)) (- new-escrow old-escrow)) (err u932))
    (rv-invariants-hold)))

(define-read-only (can-test-update-price-rebalances (i uint) (p uint))
  (match (map-get? bids (rv-bid-id i))
    bid (and
      (is-eq (get bidder bid) tx-sender)
      (not (var-get contract-paused))
      (is-collection-enabled RV_NFT)
      (is-ft-whitelisted RV_SBTC)
      (not (is-eq (rv-price p) (get price bid)))
      ;; can the bidder fund a raise?
      (or (<= (rv-price p) (get price bid))
          (>= (rv-sbtc-of tx-sender) (* (- (rv-price p) (get price bid)) (get remaining bid)))))
    false))

;; ---- deploy-time setup -----------------------------------------------------
(var-set fakfun tx-sender)
(map-set collections RV_NFT {enabled: true, royalty-bps: u250, royalty-recipient: tx-sender})
(map-set whitelisted-fts RV_SBTC true)
(unwrap-panic (contract-call? .rv-ft mint u1000000000 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM))
(unwrap-panic (contract-call? .rv-ft mint u1000000000 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5))
(unwrap-panic (contract-call? .rv-ft mint u1000000000 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG))
(unwrap-panic (contract-call? .rv-ft mint u1000000000 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC))
(define-private (rv-mint-10 (to principal))
  (begin
    (try! (contract-call? .rv-nft mint to)) (try! (contract-call? .rv-nft mint to))
    (try! (contract-call? .rv-nft mint to)) (try! (contract-call? .rv-nft mint to))
    (try! (contract-call? .rv-nft mint to)) (try! (contract-call? .rv-nft mint to))
    (try! (contract-call? .rv-nft mint to)) (try! (contract-call? .rv-nft mint to))
    (try! (contract-call? .rv-nft mint to)) (try! (contract-call? .rv-nft mint to))
    (ok true)))
(unwrap-panic (rv-mint-10 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM))
(unwrap-panic (rv-mint-10 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5))
(unwrap-panic (rv-mint-10 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG))
(unwrap-panic (rv-mint-10 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC))
