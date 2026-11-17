(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant ERR_EMPTY (err u100))
(define-constant ERR_SELF_SEND (err u101))

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

(define-public (send-many-to
    (nft <nft-trait>)
    (ids (list 200 uint))
    (recipient principal)
  )
  (begin
    (asserts! (> (len ids) u0) ERR_EMPTY)
    (asserts! (not (is-eq tx-sender recipient)) ERR_SELF_SEND)
    (try! (fold send-id-fold ids
      (ok {
        nft: nft,
        recipient: recipient,
      })
    ))
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

(define-public (send-multi-to
    (groups (list 10 {
      nft: <nft-trait>,
      ids: (list 200 uint),
    }))
    (recipient principal)
  )
  (let ((total (try! (fold send-group-fold groups
      (ok {
        recipient: recipient,
        count: u0,
      })
    ))))
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

(define-public (send-mixed (items (list 200 {
  nft: <nft-trait>,
  id: uint,
  recipient: principal,
})))
  (begin
    (asserts! (> (len items) u0) ERR_EMPTY)
    (try! (fold send-mixed-fold items (ok u0)))
    (print {
      event: "nft-dispatch",
      kind: "send-mixed",
      sender: tx-sender,
      count: (len items),
    })
    (ok (len items))
  )
)

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
    } uint
    ))
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
    } uint
    ))
  )
  (match acc
    ctx (begin
      (try! (fold send-id-fold (get ids group)
        (ok {
          nft: (get nft group),
          recipient: (get recipient ctx),
        })
      ))
      (ok {
        recipient: (get recipient ctx),
        count: (+ (get count ctx) (len (get ids group))),
      })
    )
    e (err e)
  )
)

(define-private (send-mixed-fold
    (item {
      nft: <nft-trait>,
      id: uint,
      recipient: principal,
    })
    (acc (response uint uint))
  )
  (match acc
    n (let ((nft (get nft item)))
      (try! (asserts-not-self (get recipient item)))
      (try! (contract-call? nft transfer (get id item) tx-sender (get recipient item)))
      (ok (+ n u1))
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
