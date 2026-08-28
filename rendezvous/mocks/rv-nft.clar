;; TEST-ONLY SIP-009 collection for fuzzing fakfun-collection-bids: open mint,
;; honest transfer. Never deployed anywhere.
(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(define-non-fungible-token rv-pepe uint)
(define-data-var last-id uint u0)
(define-read-only (get-last-token-id) (ok (var-get last-id)))
(define-read-only (get-token-uri (id uint)) (ok none))
(define-read-only (get-owner (id uint)) (ok (nft-get-owner? rv-pepe id)))
(define-public (transfer (id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) (err u104))
    (nft-transfer? rv-pepe id sender recipient)))
(define-public (mint (to principal))
  (let ((id (+ (var-get last-id) u1)))
    (try! (nft-mint? rv-pepe id to))
    (var-set last-id id)
    (ok id)))
