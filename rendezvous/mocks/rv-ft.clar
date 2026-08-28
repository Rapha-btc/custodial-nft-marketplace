;; TEST-ONLY SIP-010 token for fuzzing fakfun-collection-bids. Implements the
;; same trait contract the bids contract imports (sBTC on mainnet implements
;; its own copy, which rv cannot match). Open mint. Never deployed anywhere.
(impl-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)
(define-fungible-token rv-sats)
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) (err u4))
    (ft-transfer? rv-sats amount sender recipient)))
(define-read-only (get-name) (ok "rv-sats"))
(define-read-only (get-symbol) (ok "RVS"))
(define-read-only (get-decimals) (ok u8))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance rv-sats who)))
(define-read-only (get-total-supply) (ok (ft-get-supply rv-sats)))
(define-read-only (get-token-uri) (ok none))
(define-public (mint (amount uint) (to principal)) (ft-mint? rv-sats amount to))
