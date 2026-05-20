;; SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.fakfun-nfts-core

(use-trait nftmarket-trait 'SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22.fakfun-nftmarket-trait.nftmarket-trait)
(use-trait nft-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)
(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

(define-constant DEPLOYER tx-sender)

(define-constant ERR-UNAUTHORIZED (err u5001))
(define-constant ERR-NOT-REGISTERED (err u5002))
(define-constant ERR-INVALID-CONTRACT-HASH (err u5004))

(define-map verified-contracts principal (buff 32))

(define-map marketplaces principal {
  nft-contract: principal,
  name: (string-ascii 128),
  creation-height: uint,
})

(define-map marketplace-contracts principal bool)

(define-public (whitelist-marketplace
    (marketplace principal)
    (nft-contract principal)
    (name (string-ascii 128))
    (allowed bool)
  )
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-UNAUTHORIZED)
    (map-set marketplace-contracts marketplace allowed)
    (map-set marketplaces marketplace {
      nft-contract: nft-contract,
      name: name,
      creation-height: burn-block-height,
    })
    (print {
      event: "marketplace-registered",
      marketplace-contract: contract-caller,
      nft-contract: nft-contract,
      name: name,
      verified-by: DEPLOYER,
      allowed: allowed,
    })
    (ok true)
  )
)

(define-public (set-verified-contract (contract principal) (hash (optional (buff 32))))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-UNAUTHORIZED)
    (match hash
      provided-hash (begin
        (map-set verified-contracts contract provided-hash)
        (print { event: "verified-contract-set", contract: contract, hash: provided-hash })
        (ok true)
      )
      (let ((computed-hash (unwrap-panic (contract-hash? contract))))
        (map-set verified-contracts contract computed-hash)
        (print { event: "verified-contract-set", contract: contract, hash: computed-hash })
        (ok true)
      )
    )
  )
)

(define-public (remove-verified-contract (contract principal))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR-UNAUTHORIZED)
    (map-delete verified-contracts contract)
    (print { event: "verified-contract-removed", contract: contract })
    (ok true)
  )
)

(define-read-only (get-verified-contract-hash (contract principal))
  (map-get? verified-contracts contract)
)

(define-read-only (get-contract-hash (contract principal))
  (contract-hash? contract)
)

(define-public (register-marketplace
    (verified-contract principal)
    (nft-contract principal)
    (name (string-ascii 128))
  )
  (let (
    (caller-hash (unwrap-panic (contract-hash? contract-caller)))
    (verified-hash (map-get? verified-contracts verified-contract))
  )
    (asserts! (is-some verified-hash) ERR-UNAUTHORIZED)
    (asserts! (is-eq (some caller-hash) verified-hash) ERR-INVALID-CONTRACT-HASH)
    (map-set marketplaces contract-caller {
      nft-contract: nft-contract,
      name: name,
      creation-height: burn-block-height,
    })
    (map-set marketplace-contracts contract-caller true)
    (print {
      event: "marketplace-registered",
      marketplace-contract: contract-caller,
      nft-contract: nft-contract,
      name: name,
      verified-against: verified-contract,
    })
    (ok true)
  )
)

(define-public (list-nft
    (marketplace <nftmarket-trait>)
    (token-id uint)
    (nft-contract <nft-trait>)
    (ft-contract <ft-trait>)
    (price uint)
  )
  (begin
    (asserts! (default-to false (map-get? marketplace-contracts (contract-of marketplace))) ERR-NOT-REGISTERED)
    (let ((result (try! (contract-call? marketplace list-nft token-id nft-contract ft-contract price))))
      (print {
        event: "nft-listed",
        marketplace: (contract-of marketplace),
        token-id: token-id,
        seller: tx-sender,
        nft-contract: (contract-of nft-contract),
        ft-contract: (contract-of ft-contract),
        price: price,
      })
      (ok result)
    )
  )
)

(define-public (buy-nft
    (marketplace <nftmarket-trait>)
    (token-id uint)
    (nft-contract <nft-trait>)
    (ft-contract <ft-trait>)
  )
  (begin
    (asserts! (default-to false (map-get? marketplace-contracts (contract-of marketplace))) ERR-NOT-REGISTERED)
    (let ((result (try! (contract-call? marketplace buy-nft token-id nft-contract ft-contract))))
      (print {
        event: "nft-sold",
        marketplace: (contract-of marketplace),
        nft-contract: (contract-of nft-contract),
        token-id: token-id,
        buyer: tx-sender,
        ft-contract: (contract-of ft-contract),
      })
      (ok result)
    )
  )
)

(define-public (unlist-nft
    (marketplace <nftmarket-trait>)
    (token-id uint)
    (nft-contract <nft-trait>)
  )
  (begin
    (asserts! (default-to false (map-get? marketplace-contracts (contract-of marketplace))) ERR-NOT-REGISTERED)
    (let ((result (try! (contract-call? marketplace unlist-nft token-id nft-contract))))
      (print {
        event: "nft-unlisted",
        marketplace: (contract-of marketplace),
        token-id: token-id,
        nft-contract: (contract-of nft-contract),
        seller: tx-sender,
      })
      (ok result)
    )
  )
)

(define-public (update-price
    (marketplace <nftmarket-trait>)
    (token-id uint)
    (new-price uint)
  )
  (begin
    (asserts! (default-to false (map-get? marketplace-contracts (contract-of marketplace))) ERR-NOT-REGISTERED)
    (let ((result (try! (contract-call? marketplace update-price token-id new-price))))
      (print {
        event: "nft-price-updated",
        marketplace: (contract-of marketplace),
        token-id: token-id,
        new-price: new-price,
        seller: tx-sender,
      })
      (ok result)
    )
  )
)

(define-public (update-listing-ft
    (marketplace <nftmarket-trait>)
    (token-id uint)
    (new-ft-contract <ft-trait>)
    (new-price uint)
  )
  (begin
    (asserts! (default-to false (map-get? marketplace-contracts (contract-of marketplace))) ERR-NOT-REGISTERED)
    (let ((result (try! (contract-call? marketplace update-listing-ft token-id new-ft-contract new-price))))
      (print {
        event: "nft-listing-ft-updated",
        marketplace: (contract-of marketplace),
        token-id: token-id,
        new-ft-contract: (contract-of new-ft-contract),
        new-price: new-price,
        seller: tx-sender,
      })
      (ok result)
    )
  )
)

(define-read-only (get-marketplace-info (marketplace-contract principal))
  (map-get? marketplaces marketplace-contract)
)

(define-read-only (is-marketplace-registered (marketplace-contract principal))
  (default-to false (map-get? marketplace-contracts marketplace-contract))
)