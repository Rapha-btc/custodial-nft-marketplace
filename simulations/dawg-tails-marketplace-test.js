// dawg-tails-marketplace-test.js
// Comprehensive stxer simulation for a dawg-tails fakfun-style
// marketplace. Deploys the generic custodial-marketplace.clar template,
// initializes it for the-dawg-tails-collection, whitelists the
// dawgpool-stxcity FT, then runs the full happy path + edge cases
// across 8 NFTs sourced from two on-chain holders.
import fs from "node:fs";
import {
  ClarityVersion,
  uintCV,
  principalCV,
  contractPrincipalCV,
  boolCV,
} from "@stacks/transactions";
import { SimulationBuilder } from "stxer";

// ============================================================
// PRINCIPALS
// ============================================================
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22"; // marketplace deployer/admin
const SELLER1 = "SP3WAAYXPC6WZNEC7SHGR36D32RJPZVXRR1BG0QSY"; // owns dawg-tails 2,4,7,9,14
const SELLER2 = "SP2Z2CBMGWB9MQZAF5Z8X56KS69XRV3SJF4WKJ7J9"; // owns dawg-tails 3,8,19,25
const BUYER = "SP389APB4DHZ836P4AE9RJW7EKEZAPV5NPDNG7N46";   // owns 4 NFTs; presumed dawgpool holder
const RANDOM_USER = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

// ============================================================
// CONTRACTS
// ============================================================
const MARKETPLACE = `${DEPLOYER}.dawg-tails-marketplace`;
const DAWG_NFT = "SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV.the-dawg-tails-collection";
const DAWG_NFT_ADDR = "SPH5Q4TV7WAVGDN74171PYAAQDHG2P291PPQ74HV";
const DAWG_NFT_NAME = "the-dawg-tails-collection";
const DAWGPOOL_FT_ADDR = "SPQYMRAKZPQPJAADX5JBEFT0FHE3RZZK9F8TYBQ3";
const DAWGPOOL_FT_NAME = "dawgpool-stxcity";
const NOT_WHITELISTED_FT_ADDR = "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT";
const NOT_WHITELISTED_FT_NAME = "notastrategy";

// ============================================================
// NFTs (all 8 across two sellers)
// ============================================================
const SELLER1_IDS = [2, 4, 7, 9, 14]; // 5 NFTs owned by SELLER1
const SELLER2_IDS = [3, 8, 19];        // 3 NFTs owned by SELLER2 (skips #25)

// ============================================================
// PRICES (dawgpool has 6 decimals → 1 dawgpool = 1_000_000 micro)
// ============================================================
const ONE_DAWG = 1_000_000n;
const PRICE_100 = Number(100n * ONE_DAWG);
const PRICE_200 = Number(200n * ONE_DAWG);
const PRICE_300 = Number(300n * ONE_DAWG);
const PRICE_400 = Number(400n * ONE_DAWG);
const PRICE_500 = Number(500n * ONE_DAWG);
const PRICE_600 = Number(600n * ONE_DAWG);
const PRICE_700 = Number(700n * ONE_DAWG);
const PRICE_800 = Number(800n * ONE_DAWG);
const PRICE_INSANE = Number(1_000_000_000n * ONE_DAWG); // 1B dawgpool — far above buyer

const nft = () => contractPrincipalCV(DAWG_NFT_ADDR, DAWG_NFT_NAME);
const ft = () => contractPrincipalCV(DAWGPOOL_FT_ADDR, DAWGPOOL_FT_NAME);
const badFt = () => contractPrincipalCV(NOT_WHITELISTED_FT_ADDR, NOT_WHITELISTED_FT_NAME);

async function main() {
  console.log("=== DAWG-TAILS MARKETPLACE — STXER SIMULATION ===\n");
  console.log("Deployer/Admin:", DEPLOYER);
  console.log("Seller1 (5 NFTs):", SELLER1, SELLER1_IDS);
  console.log("Seller2 (3 NFTs):", SELLER2, SELLER2_IDS);
  console.log("Buyer:", BUYER);
  console.log("Random user:", RANDOM_USER);
  console.log("NFT:", DAWG_NFT);
  console.log("FT:", `${DAWGPOOL_FT_ADDR}.${DAWGPOOL_FT_NAME}`);
  console.log("\n");

  SimulationBuilder.new()
    // ──────────────────────────────────────────────────────────
    // STEP 1: Deploy the generic custodial-marketplace template
    // ──────────────────────────────────────────────────────────
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: "dawg-tails-marketplace",
      // pepe-marketplace.clar is the production-tested reusable template
      // — initialize(nft-contract) sets the allowed NFT; same bytecode
      // works for any collection. The custodial-marketplace.clar variant
      // in this repo adds an auction extension that doesn't compile.
      source_code: fs.readFileSync(
        "./contracts/pepe-marketplace.clar",
        "utf8",
      ),
      clarity_version: ClarityVersion.Clarity4,
    })

    // ──────────────────────────────────────────────────────────
    // STEP 2: Initialize for the dawg-tails NFT collection
    // Expected: (ok true). If the NFT contract doesn't conform to
    // SIP-009 nft-trait, the marketplace will still deploy + init
    // (initialize takes a plain principal), but every subsequent
    // list-nft call passing <nft-trait> will fail at trait check.
    // ──────────────────────────────────────────────────────────
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [principalCV(DAWG_NFT)],
    })

    // ──────────────────────────────────────────────────────────
    // STEP 3: Whitelist dawgpool-stxcity for payments
    // ──────────────────────────────────────────────────────────
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [ft(), boolCV(true)],
    })

    // ──────────────────────────────────────────────────────────
    // STEP 4–8: SELLER1 lists all 5 of their NFTs at increasing
    // prices. Each call exercises the <nft-trait> + custody
    // transfer + price recording.
    // ──────────────────────────────────────────────────────────
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(2), nft(), ft(), uintCV(PRICE_100)],
    })
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(4), nft(), ft(), uintCV(PRICE_200)],
    })
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(7), nft(), ft(), uintCV(PRICE_300)],
    })
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(9), nft(), ft(), uintCV(PRICE_400)],
    })
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(14), nft(), ft(), uintCV(PRICE_500)],
    })

    // ──────────────────────────────────────────────────────────
    // STEP 9–11: SELLER2 lists their 3 NFTs.
    // ──────────────────────────────────────────────────────────
    .withSender(SELLER2)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(3), nft(), ft(), uintCV(PRICE_600)],
    })
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(8), nft(), ft(), uintCV(PRICE_700)],
    })
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(19), nft(), ft(), uintCV(PRICE_800)],
    })

    // ──────────────────────────────────────────────────────────
    // STEP 12: SELLER1 updates the price on NFT #2 (100 → 150)
    // ──────────────────────────────────────────────────────────
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [uintCV(2), uintCV(Number(150n * ONE_DAWG))],
    })

    // ──────────────────────────────────────────────────────────
    // STEP 13: SELLER1 unlists NFT #4. NFT returns to seller.
    // ──────────────────────────────────────────────────────────
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [uintCV(4), nft()],
    })

    // ──────────────────────────────────────────────────────────
    // STEP 14: BUYER purchases NFT #7 (300 dawgpool). Tests the
    // full happy-path buy: FT transfer split (royalty + platform
    // + seller) and NFT custody release.
    // ──────────────────────────────────────────────────────────
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(7), nft(), ft()],
    })

    // ──────────────────────────────────────────────────────────
    // STEP 15: SELLER1 changes the listing FT + price on NFT #9
    // (still dawgpool, just exercising update-listing-ft).
    // ──────────────────────────────────────────────────────────
    .withSender(SELLER1)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-listing-ft",
      function_args: [uintCV(9), ft(), uintCV(Number(50n * ONE_DAWG))],
    })

    // ──────────────────────────────────────────────────────────
    // === EXPECTED-FAILURE EDGE CASES ===
    // ──────────────────────────────────────────────────────────

    // STEP 16: SELLER1 tries to list with a non-whitelisted FT
    // Expected: (err u105) ERR-FT-NOT-WHITELISTED
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(2), nft(), badFt(), uintCV(PRICE_100)],
    })

    // STEP 17a: SELLER2 lists NFT #25 at an insane price
    .withSender(SELLER2)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(25), nft(), ft(), uintCV(PRICE_INSANE)],
    })

    // STEP 17b: BUYER tries to buy NFT #25 (insufficient FT) → fails
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(25), nft(), ft()],
    })

    // STEP 18: SELLER2 tries to buy their own listing #3
    // Expected: (err u108) ERR-CANNOT-BUY-OWN
    .withSender(SELLER2)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(3), nft(), ft()],
    })

    // STEP 19: RANDOM_USER tries to unlist SELLER1's NFT #14
    // Expected: (err u104) ERR-NOT-OWNER
    .withSender(RANDOM_USER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [uintCV(14), nft()],
    })

    // STEP 20: BUYER tries to buy NFT #8 with wrong FT
    // Expected: (err u113) ERR-WRONG-FT
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(8), nft(), badFt()],
    })

    // STEP 21: DEPLOYER tries to initialize twice
    // Expected: (err u111) ERR-ALREADY-INITIALIZED
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [principalCV(DAWG_NFT)],
    })

    // STEP 22: RANDOM_USER tries to whitelist FT (unauthorized)
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    .withSender(RANDOM_USER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [badFt(), boolCV(true)],
    })

    // STEP 23a: DEPLOYER pauses the contract
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-paused",
      function_args: [boolCV(true)],
    })

    // STEP 23b: BUYER tries to buy while paused
    // Expected: (err u109) ERR-PAUSED
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(8), nft(), ft()],
    })

    // STEP 23c: DEPLOYER unpauses
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-paused",
      function_args: [boolCV(false)],
    })

    // STEP 24: RANDOM_USER tries to list NFT #14 they don't own
    // Expected: NFT transfer fails (not owner)
    .withSender(RANDOM_USER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [uintCV(14), nft(), ft(), uintCV(PRICE_100)],
    })

    // STEP 25: DEPLOYER emergency-returns NFT #25 to SELLER2
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "admin-emergency-return",
      function_args: [uintCV(25), nft()],
    })

    // STEP 26: BUYER successfully purchases NFT #8 (700 dawgpool)
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [uintCV(8), nft(), ft()],
    })

    .run()
    .catch(console.error);
}

main();
