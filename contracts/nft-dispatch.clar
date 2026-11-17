;; nft-dispatch
;; Send many SIP-009 NFTs in ONE transaction, with ONE signature.
;;
;; - All-or-nothing: if any single transfer fails, the whole tx reverts
;;   and nothing moves.
;; - No custody, no owner, no fees, no admin. The contract never holds an NFT:
;;   each transfer is (transfer id tx-sender recipient) called on behalf of the signer.
;; - Post-conditions: the signer's wallet shows "you send NFT X #id" for each item.
;;   Use Deny mode in the FE.

(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant ERR_EMPTY (err u100))
(define-constant ERR_SELF_SEND (err u101))


;; ---------------------------------------------------------------------
;; One collection, many ids, each id to its own recipient
;; ---------------------------------------------------------------------
(define-public (send-many
    (nft <nft-trait>)
    (items (list 200 {
      id: uint,
      recipient: principal,
    }))
  )
  (begin
    (asserts! (> (len items) u0) ERR_EMPTY)
    (try! (fold send-one-fold items (ok nft)))
    (print {
      event: "nft-dispatch",
      kind: "send-many",
      sender: tx-sender,
      nft: (contract-of nft),
      count: (len items),
    })
    (ok (len items))
  )
)

;; ---------------------------------------------------------------------
;; One collection, many ids, all to the same recipient
;; ---------------------------------------------------------------------
(define-public (send-many-to
    (nft <nft-trait>)
    (ids (list 200 uint))
    (recipient principal)
  )
  (begin
    (asserts! (> (len ids) u0) ERR_EMPTY)
    (asserts! (not (is-eq tx-sender recipient)) ERR_SELF_SEND)
    (try! (fold send-id-fold ids (ok {
      nft: nft,
      recipient: recipient,
    })))
    (print {
      event: "nft-dispatch",
      kind: "send-many-to",
      sender: tx-sender,
      nft: (contract-of nft),
      recipient: recipient,
      count: (len ids),
    })
    (ok (len ids))
  )
)

;; ---------------------------------------------------------------------
;; Many collections (portfolio multi-select), one recipient.
;; Each group = one collection + its ids.
;; ---------------------------------------------------------------------
(define-public (send-multi-to
    (groups (list 10 {
      nft: <nft-trait>,
      ids: (list 200 uint),
    }))
    (recipient principal)
  )
  (let ((total (try! (fold send-group-fold groups (ok {
      recipient: recipient,
      count: u0,
    })))))
    (asserts! (> (get count total) u0) ERR_EMPTY)
    (asserts! (not (is-eq tx-sender recipient)) ERR_SELF_SEND)
    (print {
      event: "nft-dispatch",
      kind: "send-multi-to",
      sender: tx-sender,
      recipient: recipient,
      collections: (len groups),
      count: (get count total),
    })
    (ok (get count total))
  )
)

;; ---------------------------------------------------------------------
;; private folds: short-circuit on the first error, which then reverts the tx
;; ---------------------------------------------------------------------
(define-private (send-one-fold
    (item {
      id: uint,
      recipient: principal,
    })
    (acc (response <nft-trait> uint))
  )
  (match acc
    nft (begin
      (try! (asserts-not-self (get recipient item)))
      (try! (contract-call? nft transfer (get id item) tx-sender (get recipient item)))
      (ok nft)
    )
    e (err e)
  )
)

(define-private (send-id-fold
    (id uint)
    (acc (response {
      nft: <nft-trait>,
      recipient: principal,
    } uint))
  )
  (match acc
    ctx (begin
      (let ((nft (get nft ctx)))
        (try! (contract-call? nft transfer id tx-sender (get recipient ctx)))
        (ok ctx)
      )
    )
    e (err e)
  )
)

(define-private (send-group-fold
    (group {
      nft: <nft-trait>,
      ids: (list 200 uint),
    })
    (acc (response {
      recipient: principal,
      count: uint,
    } uint))
  )
  (match acc
    ctx (begin
      (try! (fold send-id-fold (get ids group) (ok {
        nft: (get nft group),
        recipient: (get recipient ctx),
      })))
      (ok {
        recipient: (get recipient ctx),
        count: (+ (get count ctx) (len (get ids group))),
      })
    )
    e (err e)
  )
)

(define-private (asserts-not-self (recipient principal))
  (if (is-eq tx-sender recipient)
    ERR_SELF_SEND
    (ok true)
  )
)
