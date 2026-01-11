// marketplace-edge-cases.js
// Additional edge case tests for pepe-marketplace contract
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
const DEPLOYER = "SPV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RCJDC22";
const SELLER = "SPV00QHST52GD7D0SEWV3R5N04RD4Q1PMA3TE2MP"; // Owns pepe NFTs
const BUYER = "SP1NPDHF9CQ8B9Q045CCQS1MR9M9SGJ5TT6WFFCD2";
const RANDOM_USER = "SP2C7BCAP2NH3EYWCCVHJ6K0DMZBXDFKQ56KR7QN2";

// ============================================================
// CONTRACTS
// ============================================================
const MARKETPLACE = `${DEPLOYER}.pepe-marketplace`;
const BITCOIN_PEPE_NFT = "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ.bitcoin-pepe";
const PEPE_TOKEN = "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.tokensoft-token-v4k68639zxz";

// Wrong NFT - not the initialized one
const WRONG_NFT = "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT.notastrategy";
// Another random NFT contract
const GAMMA_NFT = "SPNWZ5V2TPWGQGVDR6T7B6RQ4XMGZ4PXTEE0VQ0S.gamma-special-edition";

const PRICE_10M_PEPE = 10000000000;

async function main() {
  console.log("=== PEPE MARKETPLACE - EDGE CASE TESTS ===\n");

  console.log("=== PRE-INITIALIZATION TESTS ===");
  console.log("1. Try to list before initialization (ERR-NOT-INITIALIZED u112)");
  console.log("2. Try to buy before initialization (ERR-NOT-LISTED u103)");
  console.log("\n");

  console.log("=== WRONG NFT CONTRACT TESTS ===");
  console.log("3. Initialize marketplace");
  console.log("4. Try to list with wrong NFT contract (ERR-WRONG-NFT u110)");
  console.log("5. List valid NFT, try to buy with wrong NFT contract (ERR-WRONG-NFT u110)");
  console.log("6. Try to unlist with wrong NFT contract (ERR-WRONG-NFT u110)");
  console.log("\n");

  console.log("=== DOUBLE ACTIONS ===");
  console.log("7. Try to initialize a second time (ERR-ALREADY-INITIALIZED u111)");
  console.log("8. List NFT #137, try to list same token again (ERR-ALREADY-LISTED u102)");
  console.log("\n");

  console.log("=== INVALID PARAMETERS ===");
  console.log("9. Try to list with price = 0 (ERR-INVALID-PRICE u107)");
  console.log("10. Try to update price to 0 (ERR-INVALID-PRICE u107)");
  console.log("11. Try to set royalty > 10% (ERR-NOT-AUTHORIZED u100)");
  console.log("12. Try to set platform fee > 5% (ERR-NOT-AUTHORIZED u100)");
  console.log("\n");

  console.log("=== NON-EXISTENT LISTINGS ===");
  console.log("13. Try to buy non-existent listing (ERR-NOT-LISTED u103)");
  console.log("14. Try to unlist non-existent listing (ERR-NOT-LISTED u103)");
  console.log("15. Try to update price on non-existent listing (ERR-NOT-LISTED u103)");
  console.log("16. Try emergency return on non-existent listing (ERR-NOT-LISTED u103)");
  console.log("\n");

  console.log("=== PERMISSION TESTS ===");
  console.log("17. Non-admin tries emergency return (ERR-NOT-AUTHORIZED u100)");
  console.log("18. Non-owner tries to update price (ERR-NOT-OWNER u104)");
  console.log("19. Non-owner tries to update listing FT (ERR-NOT-OWNER u104)");
  console.log("20. Non-admin tries to set royalty percent (ERR-NOT-AUTHORIZED u100)");
  console.log("21. Non-admin tries to set royalty recipient (ERR-NOT-AUTHORIZED u100)");
  console.log("22. Non-admin tries to set platform fee (ERR-NOT-AUTHORIZED u100)");
  console.log("23. Non-admin tries to set platform recipient (ERR-NOT-AUTHORIZED u100)");
  console.log("\n");

  console.log("=== WRONG WHITELISTED FT TESTS ===");
  console.log("24. List for PEPE, buy with notastrategy (ERR-WRONG-FT u113)");
  console.log("25. List for notastrategy, buy with PEPE (ERR-WRONG-FT u113)");
  console.log("\n");

  console.log("=== STALE LISTING TESTS ===");
  console.log("26. List #178, unlist it, then try to buy (ERR-NOT-LISTED u103)");
  console.log("\n");

  console.log("=== PRICE UPDATE TESTS ===");
  console.log("27. List #267 at 10M, update to 50M, buy pays 50M (ok true)");
  console.log("    - Verifies buyer pays UPDATED price, not original");
  console.log("\n");

  console.log("=== PAUSED CONTRACT TESTS ===");
  console.log("28. Pause contract, then try:");
  console.log("    - list-nft (ERR-PAUSED u109)");
  console.log("    - buy-nft (ERR-PAUSED u109)");
  console.log("    - update-price (ERR-PAUSED u109)");
  console.log("    - update-listing-ft (ERR-PAUSED u109)");
  console.log("    - unlist-nft (OK - seller can always reclaim!)");
  console.log("29. Unpause, verify operations work again");
  console.log("\n");

  console.log("=== POST EMERGENCY RETURN TESTS ===");
  console.log("30. Try to buy NFT after admin-emergency-return (ERR-NOT-LISTED u103)");
  console.log("\n");

  SimulationBuilder.new()
    // ============================================================
    // Deploy marketplace contract
    // ============================================================
    .withSender(DEPLOYER)
    .addContractDeploy({
      contract_name: "pepe-marketplace",
      source_code: fs.readFileSync(
        "./contracts/pepe-marketplace.clar",
        "utf8"
      ),
      clarity_version: ClarityVersion.Clarity4,
    })

    // ============================================================
    // STEP 1: Try to list BEFORE initialization
    // Expected: (err u112) ERR-NOT-INITIALIZED
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // STEP 2: Try to buy BEFORE initialization (no listings anyway)
    // Expected: (err u103) ERR-NOT-LISTED
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // STEP 3: Initialize marketplace properly
    // Expected: (ok true)
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [
        principalCV(BITCOIN_PEPE_NFT),
      ],
    })

    // Whitelist PEPE token
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        boolCV(true),
      ],
    })

    // Whitelist notastrategy token too (for wrong FT test)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "whitelist-ft",
      function_args: [
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ),
        boolCV(true),
      ],
    })

    // ============================================================
    // STEP 4: Try to list with WRONG NFT contract (notastrategy)
    // Expected: (err u110) ERR-WRONG-NFT
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ), // WRONG NFT CONTRACT!
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // STEP 5a: List valid NFT #137
    // Expected: (ok true)
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // STEP 5b: Try to buy with WRONG NFT contract
    // Expected: (err u110) ERR-WRONG-NFT
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ), // WRONG NFT CONTRACT!
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // STEP 6: Try to unlist with WRONG NFT contract
    // Expected: (err u110) ERR-WRONG-NFT
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ), // WRONG NFT CONTRACT!
      ],
    })

    // ============================================================
    // STEP 7: Try to initialize AGAIN
    // Expected: (err u111) ERR-ALREADY-INITIALIZED
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "initialize",
      function_args: [
        principalCV(BITCOIN_PEPE_NFT),
      ],
    })

    // ============================================================
    // STEP 8: Try to list same token #137 again (already listed)
    // Expected: (err u102) ERR-ALREADY-LISTED
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(137), // Already listed!
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // STEP 9: Try to list with price = 0
    // Expected: (err u107) ERR-INVALID-PRICE
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(139),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(0), // ZERO PRICE!
      ],
    })

    // ============================================================
    // STEP 10: Try to update price to 0
    // Expected: (err u107) ERR-INVALID-PRICE
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [
        uintCV(137),
        uintCV(0), // ZERO PRICE!
      ],
    })

    // ============================================================
    // STEP 11: Try to set royalty > 10% (max is 1000 basis points)
    // Expected: (err u100) ERR-NOT-AUTHORIZED (the assert uses this error)
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-royalty-percent",
      function_args: [
        uintCV(1500), // 15% - exceeds 10% max!
      ],
    })

    // ============================================================
    // STEP 12: Try to set platform fee > 5% (max is 500 basis points)
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-platform-fee",
      function_args: [
        uintCV(600), // 6% - exceeds 5% max!
      ],
    })

    // ============================================================
    // STEP 13: Try to buy non-existent listing (token #9999)
    // Expected: (err u103) ERR-NOT-LISTED
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(9999), // Does not exist!
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // STEP 14: Try to unlist non-existent listing (token #9999)
    // Expected: (err u103) ERR-NOT-LISTED
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(9999), // Does not exist!
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // STEP 15: Try to update price on non-existent listing
    // Expected: (err u103) ERR-NOT-LISTED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [
        uintCV(9999), // Does not exist!
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // ============================================================
    // STEP 16: Try emergency return on non-existent listing
    // Expected: (err u103) ERR-NOT-LISTED
    // ============================================================
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "admin-emergency-return",
      function_args: [
        uintCV(9999), // Does not exist!
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // STEP 17: Non-admin tries emergency return on valid listing
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .withSender(RANDOM_USER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "admin-emergency-return",
      function_args: [
        uintCV(137), // Valid listing
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // STEP 18: Non-owner tries to update price
    // Expected: (err u104) ERR-NOT-OWNER
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [
        uintCV(137), // Listed by SELLER, not RANDOM_USER
        uintCV(PRICE_10M_PEPE * 2),
      ],
    })

    // ============================================================
    // STEP 19: Non-owner tries to update listing FT
    // Expected: (err u104) ERR-NOT-OWNER
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-listing-ft",
      function_args: [
        uintCV(137), // Listed by SELLER, not RANDOM_USER
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE * 2),
      ],
    })

    // ============================================================
    // STEP 20: Non-admin tries to set royalty percent
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-royalty-percent",
      function_args: [
        uintCV(100), // 1%
      ],
    })

    // ============================================================
    // STEP 21: Non-admin tries to set royalty recipient
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-royalty-recipient",
      function_args: [
        principalCV(RANDOM_USER),
      ],
    })

    // ============================================================
    // STEP 22: Non-admin tries to set platform fee
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-platform-fee",
      function_args: [
        uintCV(100), // 1%
      ],
    })

    // ============================================================
    // STEP 23: Non-admin tries to set platform recipient
    // Expected: (err u100) ERR-NOT-AUTHORIZED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-platform-recipient",
      function_args: [
        principalCV(RANDOM_USER),
      ],
    })

    // ============================================================
    // STEP 24: Buy with WRONG whitelisted FT
    // Both PEPE and notastrategy are whitelisted, but listing is for PEPE
    // Buyer tries to pay with notastrategy
    // Expected: (err u113) ERR-WRONG-FT
    // ============================================================
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(137), // Listed for PEPE token
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ), // WRONG FT - listing is for PEPE, not notastrategy!
      ],
    })

    // ============================================================
    // STEP 25: List #139 for notastrategy, try buy with PEPE
    // Expected: (err u113) ERR-WRONG-FT
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(139),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP2TT71CXBRDDYP2P8XMVKRFYKRGSMBWCZ6W6FDGT",
          "notastrategy"
        ), // Listed for notastrategy
        uintCV(PRICE_10M_PEPE),
      ],
    })

    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(139), // Listed for notastrategy
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ), // WRONG FT - listing is for notastrategy, not PEPE!
      ],
    })

    // ============================================================
    // STEP 26: List #178, unlist it, then try to buy
    // Expected: (err u103) ERR-NOT-LISTED
    // ============================================================
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(178),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // Seller unlists #178
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(178),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // Buyer tries to buy #178 which was unlisted
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(178), // Was listed then unlisted!
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // STEP 27: List at 10M, update to 50M, verify buy pays 50M
    // This verifies buyer pays the UPDATED price
    // ============================================================

    // 27a: Seller lists #267 at 10M PEPE
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(267),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE), // Original: 10M PEPE
      ],
    })

    // 27b: Seller updates price to 50M PEPE
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [
        uintCV(267),
        uintCV(50000000000), // Updated: 50M PEPE
      ],
    })

    // 27c: Buyer purchases at UPDATED price (50M PEPE)
    // Expected: (ok true) - buyer pays 50M, not 10M
    // Fee breakdown at 50M:
    //   - Royalty (2.5%): 1.25M PEPE
    //   - Platform (2.5%): 1.25M PEPE
    //   - Seller (95%): 47.5M PEPE
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(267),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // STEP 28: Pause contract and try all public functions
    // ============================================================

    // First, list #274 so we have something to test with
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(274),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // Admin pauses contract
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-paused",
      function_args: [boolCV(true)],
    })

    // 28a: Try to list when paused
    // Expected: (err u109) ERR-PAUSED
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(334),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // 28b: Try to buy when paused
    // Expected: (err u109) ERR-PAUSED
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(274),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // 28c: Try to update price when paused
    // Expected: (err u109) ERR-PAUSED
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-price",
      function_args: [
        uintCV(274),
        uintCV(PRICE_10M_PEPE * 2),
      ],
    })

    // 28d: Try to update listing FT when paused
    // Expected: (err u109) ERR-PAUSED
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "update-listing-ft",
      function_args: [
        uintCV(274),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE * 3),
      ],
    })

    // 28e: Unlist when paused - THIS SHOULD WORK!
    // Seller can always reclaim their NFT even when paused
    // Expected: (ok true)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(274),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // 28f: Admin emergency return works when paused
    // First re-list #274 (contract still paused, so this should fail)
    // Actually, we just unlisted #274, and listing is blocked when paused
    // So let's just verify emergency return works on #137 which is still listed
    // Expected: (ok true) - admin functions work when paused
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "admin-emergency-return",
      function_args: [
        uintCV(137),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // ============================================================
    // STEP 29: Unpause and verify operations work again
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-paused",
      function_args: [boolCV(false)],
    })

    // List #334 should work now
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "list-nft",
      function_args: [
        uintCV(334),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
        uintCV(PRICE_10M_PEPE),
      ],
    })

    // Buy #334 should work now
    .withSender(BUYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(334),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // STEP 30: Try to buy NFT after admin-emergency-return
    // #137 was emergency-returned in step 28f, listing is deleted
    // Expected: (err u103) ERR-NOT-LISTED
    // ============================================================
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "buy-nft",
      function_args: [
        uintCV(137), // Was emergency-returned, no longer listed!
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
        contractPrincipalCV(
          "SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275",
          "tokensoft-token-v4k68639zxz"
        ),
      ],
    })

    // ============================================================
    // CLEANUP: Successful operations to verify contract still works
    // ============================================================

    // Seller unlists #139
    .withSender(SELLER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "unlist-nft",
      function_args: [
        uintCV(139),
        contractPrincipalCV(
          "SP16SRR777TVB1WS5XSS9QT3YEZEC9JQFKYZENRAJ",
          "bitcoin-pepe"
        ),
      ],
    })

    // Note: #137 was already returned via admin-emergency-return in step 28f

    // Admin can still set valid royalty (5%)
    .withSender(DEPLOYER)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-royalty-percent",
      function_args: [
        uintCV(500), // 5% - valid
      ],
    })

    // Admin can still set valid platform fee (3%)
    .addContractCall({
      contract_id: MARKETPLACE,
      function_name: "set-platform-fee",
      function_args: [
        uintCV(300), // 3% - valid
      ],
    })

    .run()
    .catch(console.error);
}

main();
